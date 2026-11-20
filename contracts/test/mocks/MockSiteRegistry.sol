// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A local stand-in for the DeWEB SiteRegistry with its write rules (TapeKit SPEC appendix B), for the
///         anvil rehearsal of `deweb:publish -- --emit` and 07_DewebPublish.s.sol. scripts/test/site/deweb-local.test.ts
///         puts its runtime code at the real registry address with anvil_setCode. Every non-zero address counts as an
///         opened container and anyone may write: the editor check is the real registry's job, not this mock's.
///         Each chunk is stored as the code of a small contract (SSTORE2 style), so writes cost about what the real
///         registry's gas model says (about 222 gas per byte), and an append never rewrites the chunks before it.
contract MockSiteRegistry {
    uint256 public constant CHUNK_MAX = 24_000;

    struct Stored {
        mapping(uint256 => address) chunks;
        uint256 chunkCount;
        uint256 size;
        string contentType;
        bytes32 sha256Hash;
        uint40 updatedAt;
        uint256 slot; // 1 + index in paths[container]; 0 when absent
    }

    mapping(address => mapping(string => Stored)) internal files;
    mapping(address => string[]) internal paths;
    mapping(address => string) internal fallbacks;

    function putFile(
        address container,
        string calldata path,
        string calldata contentType,
        bytes32 sha256Hash,
        bytes calldata firstChunk
    ) external {
        require(firstChunk.length <= CHUNK_MAX, "chunk too large");
        Stored storage f = files[container][path];
        if (f.slot == 0) {
            paths[container].push(path);
            f.slot = paths[container].length;
        }
        f.chunks[0] = _write(firstChunk);
        f.chunkCount = 1;
        f.size = firstChunk.length;
        f.contentType = contentType;
        f.sha256Hash = sha256Hash;
        f.updatedAt = uint40(block.timestamp);
    }

    function appendChunk(address container, string calldata path, uint256 expectIndex, bytes calldata data) external {
        Stored storage f = files[container][path];
        require(f.slot != 0 && f.chunkCount == expectIndex, "expectIndex");
        require(data.length <= CHUNK_MAX, "chunk too large");
        f.chunks[expectIndex] = _write(data);
        f.chunkCount = expectIndex + 1;
        f.size += data.length;
        f.updatedAt = uint40(block.timestamp);
    }

    function removeFile(address container, string calldata path) external {
        Stored storage f = files[container][path];
        require(f.slot != 0, "no such file");
        string[] storage list = paths[container];
        uint256 i = f.slot - 1;
        string memory last = list[list.length - 1];
        list[i] = last;
        files[container][last].slot = i + 1;
        list.pop();
        f.slot = 0;
        f.chunkCount = 0;
        f.size = 0;
        f.contentType = "";
        f.sha256Hash = 0;
    }

    function setFallback(address container, string calldata path) external {
        fallbacks[container] = path;
    }

    function fileInfo(address container, string calldata path)
        external
        view
        returns (uint32 size, string memory contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)
    {
        Stored storage f = files[container][path];
        return (uint32(f.size), f.contentType, f.sha256Hash, f.updatedAt, f.chunkCount);
    }

    function read(address container, string calldata path) external view returns (bytes memory) {
        return _range(files[container][path], 0, type(uint256).max);
    }

    function readRange(address container, string calldata path, uint256 offset, uint256 length)
        external
        view
        returns (bytes memory)
    {
        return _range(files[container][path], offset, length);
    }

    function pathCount(address container) external view returns (uint256) {
        return paths[container].length;
    }

    function pathsRange(address container, uint256 start, uint256 count) external view returns (string[] memory out) {
        string[] storage list = paths[container];
        uint256 end = count > list.length || start + count > list.length ? list.length : start + count;
        out = new string[](start < end ? end - start : 0);
        for (uint256 i = start; i < end; ++i) {
            out[i - start] = list[i];
        }
    }

    function fallbackPath(address container) external view returns (string memory) {
        return fallbacks[container];
    }

    function isOpenedContainer(address container) external pure returns (bool) {
        return container != address(0);
    }

    /// @dev Deploys `0x00 ++ data` as code (the STOP byte keeps EIP-3541 from refusing data that starts with 0xEF).
    function _write(bytes calldata data) private returns (address ptr) {
        // PUSH2 size, DUP1, PUSH1 12, PUSH1 0, CODECOPY, PUSH1 0, RETURN: returns the code after these 12 bytes.
        bytes memory init = abi.encodePacked(hex"61", uint16(data.length + 1), hex"80600c6000396000f3", hex"00", data);
        assembly ("memory-safe") {
            ptr := create(0, add(init, 32), mload(init))
        }
        require(ptr != address(0), "chunk write failed");
    }

    /// @dev Bytes [offset, offset + length) of the file, clamped to its size; only the chunks that overlap are read.
    function _range(Stored storage f, uint256 offset, uint256 length) private view returns (bytes memory out) {
        if (offset >= f.size) return "";
        uint256 end = length > f.size - offset ? f.size : offset + length;
        out = new bytes(end - offset);
        uint256 pos;
        for (uint256 c = offset / CHUNK_MAX; c * CHUNK_MAX < end; ++c) {
            address ptr = f.chunks[c];
            uint256 from = c * CHUNK_MAX;
            uint256 lo = offset > from ? offset - from : 0;
            uint256 n = ptr.code.length - 1;
            uint256 hi = end - from < n ? end - from : n;
            assembly ("memory-safe") {
                extcodecopy(ptr, add(add(out, 32), pos), add(lo, 1), sub(hi, lo))
            }
            pos += hi - lo;
        }
    }
}
