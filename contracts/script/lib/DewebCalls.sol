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

    /// @notice Reads and parses deweb-calls/<file>. The text must be exactly what emitJson in scripts/lib/deweb.ts
    ///         writes for the values read here, and `calls` the strict ABI encoding of Call[]: a duplicate or extra
    ///         key, another layout or trailing bytes is refused, so the values checked are the only ones in the file.
    function load(string memory rel) internal view returns (File memory f) {
        requirePath(rel);
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/", rel));
        f.chainId = vm.parseJsonUint(json, ".chainId");
        f.registry = vm.parseJsonAddress(json, ".registry");
        f.binding = vm.parseJsonAddress(json, ".binding");
        f.container = vm.parseJsonAddress(json, ".container");
        bytes memory raw = vm.parseJsonBytes(json, ".calls");
        string memory canonical = string.concat(
            string.concat(
                "{\n  \"chainId\": ", vm.toString(f.chainId), ",\n  \"registry\": \"", vm.toString(f.registry)
            ),
            string.concat("\",\n  \"binding\": \"", vm.toString(f.binding), "\",\n  \"container\": \""),
            string.concat(vm.toString(f.container), "\",\n  \"calls\": \"", vm.toString(raw), "\"\n}\n")
        );
        if (keccak256(bytes(json)) != keccak256(bytes(canonical))) revert NotCanonicalJson();
        f.calls = abi.decode(raw, (Call[]));
        if (keccak256(abi.encode(f.calls)) != keccak256(raw)) revert NotCanonicalCalls();
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

    /// @dev The 32-byte word of `data` at byte offset `at`; the caller has checked the length.
    function _word(bytes memory data, uint256 at) private pure returns (uint256 w) {
        assembly ("memory-safe") {
            w := mload(add(add(data, 32), at))
        }
    }
}
