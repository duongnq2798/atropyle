// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice The calls file that `npm run deweb:publish -- --emit` writes and 07_DewebPublish.s.sol sends
///         (Plan 4, decision 14). The file is untrusted input: each check here limits what the signing account sends.
library DewebCalls {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev DeWEB on X Layer (Plan 4, decision 11), the same addresses as DEWEB in scripts/lib/deweb.ts.
    address internal constant REGISTRY = 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6;
    address internal constant BINDING = 0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9;

    /// @dev The only functions a file may call. Each takes the container as an argument.
    bytes4 internal constant PUTFILE = 0xfab2ed82; // putFile(address,string,string,bytes32,bytes)
    bytes4 internal constant APPENDCHUNK = 0xe2b51347; // appendChunk(address,string,uint256,bytes)
    bytes4 internal constant REMOVEFILE = 0x0a9c1871; // removeFile(address,string)
    bytes4 internal constant SETFALLBACK = 0x4dc21ad0; // setFallback(address,string)
    bytes4 internal constant BIND = 0x69e292ce; // bind(string,address,uint256)

    /// @dev The longest path or name `describe` shows.
    uint256 internal constant SHOWN = 200;

    /// @dev Relative to contracts/. foundry.toml grants forge read access to ./deweb-calls and ./circuits only.
    string internal constant DIR = "deweb-calls/";

    struct Call {
        address to;
        uint256 value;
        bytes data;
    }

    struct File {
        uint256 chainId;
        address registry;
        address binding;
        address container;
        Call[] calls;
        /// @dev keccak256 of the file's bytes: the value `--emit` prints, for the user to compare before signing.
        bytes32 hash;
    }

    error BadPath(string path);
    error NotCanonicalJson();
    error NotCanonicalCalls();
    error WrongChain(uint256 file, uint256 rpc);
    error NotDeweb(address registry, address binding);
    error NoContainer();
    error NoCalls();
    error SendsValue(uint256 index);
    error BadTarget(uint256 index, address to);
    error BadSelector(uint256 index, bytes4 selector);
    error ShortCall(uint256 index);
    error WrongContainer(uint256 index);
    error CallFailed(uint256 index, bytes reason);
    error NoExpectedHash();
    error HashMismatch(bytes32 expected, bytes32 actual);

    /// @notice A .json file under deweb-calls/, named with letters, digits and `._-/`, with no `..` anywhere.
    function requirePath(string memory rel) internal pure {
        bytes memory b = bytes(rel);
        bytes memory dir = bytes(DIR);
        uint256 n = b.length;
        if (n <= dir.length + 5) revert BadPath(rel);
        for (uint256 i; i < dir.length; ++i) {
            if (b[i] != dir[i]) revert BadPath(rel);
        }
        if (
            b[n - 6] == "/" || b[n - 5] != "." || b[n - 4] != "j" || b[n - 3] != "s" || b[n - 2] != "o"
                || b[n - 1] != "n"
        ) {
            revert BadPath(rel);
        }
        for (uint256 i; i < n; ++i) {
            bytes1 c = b[i];
            bool allowed = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c == "."
                || c == "_" || c == "-" || c == "/";
            if (!allowed || (c == "." && i + 1 < n && b[i + 1] == ".")) revert BadPath(rel);
        }
    }

    /// @notice Reads and parses deweb-calls/<file>. The text must be what emitJson in scripts/lib/deweb.ts writes
    ///         for the values read here (the hex digits of `calls` may differ in case only), and `calls` the strict
    ///         ABI encoding of Call[]: a duplicate or extra key, another layout or trailing bytes is refused, so the
    ///         values checked are the only ones in the file. The broadcast also pins the file's keccak256
    ///         (DEWEB_KECCAK in 07_DewebPublish.s.sol), which --emit computed over the exact text it wrote.
    /// @dev    A forge script has 2^30 gas, and memory costs grow with the square of its high-water mark. Every
    ///         cheatcode call copies its arguments into memory, and every large result arrives twice (the return
    ///         buffer, then the decoded copy). So the large results are moved down over the dead copies, the
    ///         helpers hand back their scratch memory, and `calls` takes the place of the file once the file is
    ///         checked: a file of N bytes peaks near 3 N bytes of memory.
    function load(string memory rel) internal view returns (File memory f) {
        requirePath(rel);
        string memory path = string.concat(vm.projectRoot(), "/", rel);
        uint256 base = _freePointer();
        string memory json = string(_kept(base, bytes(vm.readFile(path))));
        (f.chainId, f.registry, f.binding, f.container) = _header(json);
        bytes memory raw = _parsedCalls(json);
        f.hash = keccak256(bytes(json));
        bytes32 hexHash = _canonicalHexHash(f, json, raw.length);
        raw = _kept(base, raw); // `json` is not read after this line: `raw` now sits where it was
        if (hexHash != _hexHash(raw)) revert NotCanonicalJson();
        f.calls = abi.decode(raw, (Call[]));
        if (_encodedHash(f.calls) != keccak256(raw)) revert NotCanonicalCalls();
    }

    function _header(string memory json)
        private
        pure
        returns (uint256 chainId, address registry, address binding, address container)
    {
        uint256 mark = _freePointer();
        chainId = vm.parseJsonUint(json, ".chainId");
        registry = vm.parseJsonAddress(json, ".registry");
        binding = vm.parseJsonAddress(json, ".binding");
        container = vm.parseJsonAddress(json, ".container");
        _setFreePointer(mark);
    }

    function _parsedCalls(string memory json) private view returns (bytes memory) {
        uint256 mark = _freePointer();
        return _kept(mark, vm.parseJsonBytes(json, ".calls"));
    }

    /// @dev Checks that the file is `head ++ "0x" ++ 2 * rawLength hex digits ++ tail` with the exact head and tail
    ///      emitJson writes for the header values, and returns the keccak256 of the hex part (read in place). With
    ///      the length fixed, the `calls` string fills the whole hex part: a second key, an escape or another
    ///      layout would make the file longer, or the head or tail differ.
    function _canonicalHexHash(File memory f, string memory json, uint256 rawLength) private pure returns (bytes32 h) {
        uint256 mark = _freePointer();
        bytes memory head = bytes(
            string.concat(
                string.concat("{\n  \"chainId\": ", vm.toString(f.chainId), ",\n  \"registry\": \""),
                string.concat(vm.toString(f.registry), "\",\n  \"binding\": \"", vm.toString(f.binding)),
                string.concat("\",\n  \"container\": \"", vm.toString(f.container), "\",\n  \"calls\": \"")
            )
        );
        bytes memory tail = "\"\n}\n";
        bytes memory text = bytes(json);
        uint256 hexLength = 2 + 2 * rawLength;
        if (text.length != head.length + hexLength + tail.length) revert NotCanonicalJson();
        if (_hashAt(text, 0, head.length) != keccak256(head)) revert NotCanonicalJson();
        if (_hashAt(text, head.length + hexLength, tail.length) != keccak256(tail)) revert NotCanonicalJson();
        h = _hashAt(text, head.length, hexLength);
        _setFreePointer(mark);
    }

    /// @dev keccak256 of "0x" and the lowercase hex digits of `raw`.
    function _hexHash(bytes memory raw) private pure returns (bytes32 h) {
        uint256 mark = _freePointer();
        h = keccak256(bytes(vm.toString(raw)));
        _setFreePointer(mark);
    }

    function _encodedHash(Call[] memory calls) private pure returns (bytes32 h) {
        uint256 mark = _freePointer();
        h = keccak256(abi.encode(calls));
        _setFreePointer(mark);
    }

    /// @dev keccak256 of `len` bytes of `b` from byte `from`; the caller has checked the bounds.
    function _hashAt(bytes memory b, uint256 from, uint256 len) private pure returns (bytes32 h) {
        assembly {
            h := keccak256(add(add(b, 32), from), len)
        }
    }

    /// @dev Moves `b` (length word and bytes) down to `dst`, over memory that nothing reads any more, and puts the
    ///      free memory pointer right after it. The identity precompile reads all of its input before it writes,
    ///      so the two ranges may overlap.
    function _kept(uint256 dst, bytes memory b) private view returns (bytes memory out) {
        assembly {
            let n := add(mload(b), 32)
            if iszero(staticcall(gas(), 4, b, n, dst, n)) { revert(0, 0) }
            out := dst
            mstore(0x40, add(dst, and(add(n, 31), not(31))))
        }
    }

    /// @dev Only around code that returns value types, so nothing still points into the memory handed back.
    function _freePointer() private pure returns (uint256 p) {
        assembly {
            p := mload(0x40)
        }
    }

    function _setFreePointer(uint256 p) private pure {
        assembly {
            mstore(0x40, p)
        }
    }

    /// @notice What the signing account may send: on this chain only, nothing but value-free registry writes and
    ///         binds for the file's container, at the DeWEB addresses.
    function check(File memory f, uint256 chainid) internal pure {
        if (f.chainId != chainid) revert WrongChain(f.chainId, chainid);
        if (f.registry != REGISTRY || f.binding != BINDING) revert NotDeweb(f.registry, f.binding);
        if (f.container == address(0)) revert NoContainer();
        if (f.calls.length == 0) revert NoCalls();
        uint256 container = uint256(uint160(f.container));
        for (uint256 i; i < f.calls.length; ++i) {
            Call memory c = f.calls[i];
            if (c.value != 0) revert SendsValue(i);
            bool registry = c.to == f.registry;
            if (!registry && c.to != f.binding) revert BadTarget(i, c.to);
            if (c.data.length < 4) revert ShortCall(i);
            bytes4 s = bytes4(c.data);
            if (registry) {
                if (s != PUTFILE && s != APPENDCHUNK && s != REMOVEFILE && s != SETFALLBACK) revert BadSelector(i, s);
                if (c.data.length < 36) revert ShortCall(i);
                if (_word(c.data, 4) != container) revert WrongContainer(i);
            } else {
                if (s != BIND) revert BadSelector(i, s);
                if (c.data.length < 68) revert ShortCall(i);
                if (_word(c.data, 36) != container) revert WrongContainer(i);
            }
        }
    }

    /// @notice One line for the user to read before signing, such as `call 0: registry putFile index.html`: the
    ///         index, the target, the function, and the path (or the name, for bind). Call it only after `check`.
    function describe(Call memory c, uint256 index) internal pure returns (string memory) {
        bytes4 s = bytes4(c.data);
        string memory fn;
        bytes memory what;
        if (s == BIND) {
            fn = "bind";
            what = _shownString(c.data, 4); // bind(string name, address container, uint256)
        } else {
            if (s == PUTFILE) fn = "putFile";
            else if (s == APPENDCHUNK) fn = "appendChunk";
            else if (s == REMOVEFILE) fn = "removeFile";
            else fn = "setFallback";
            what = _shownString(c.data, 36); // (address container, string path, ...)
        }
        string memory target = c.to == REGISTRY ? "registry" : "binding";
        return string.concat("call ", vm.toString(index), ": ", target, " ", fn, " ", string(what));
    }

    /// @dev The ABI string argument whose head word is at byte `at` of `data`, read in place (a chunk is not copied),
    ///      at most SHOWN bytes of it. The file is untrusted: a byte outside printable ASCII becomes `?`, so a path
    ///      cannot move the cursor or recolour the terminal while the user reads it, and offsets that do not fit
    ///      give "?" (the call itself would then fail before anything is sent).
    function _shownString(bytes memory data, uint256 at) private pure returns (bytes memory out) {
        uint256 n = data.length;
        if (n < at + 32) return "?";
        uint256 off = _word(data, at);
        if (off > n || n - off < 36) return "?";
        uint256 start = 4 + off + 32;
        uint256 len = _word(data, 4 + off);
        if (len > n - start) return "?";
        bool cut = len > SHOWN;
        out = new bytes(cut ? SHOWN + 3 : len);
        for (uint256 i; i < (cut ? SHOWN : len); ++i) {
            bytes1 ch = data[start + i];
            out[i] = ch < 0x20 || ch > 0x7e ? bytes1("?") : ch;
        }
        if (cut) {
            out[SHOWN] = ".";
            out[SHOWN + 1] = ".";
            out[SHOWN + 2] = ".";
        }
    }

    /// @dev The 32-byte word of `data` at byte offset `at`; the caller has checked the length.
    function _word(bytes memory data, uint256 at) private pure returns (uint256 w) {
        assembly ("memory-safe") {
            w := mload(add(add(data, 32), at))
        }
    }
}
