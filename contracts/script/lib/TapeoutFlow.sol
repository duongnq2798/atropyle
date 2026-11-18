// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU} from "../../src/interfaces/ICPU.sol";
import {ITapeOutFactory, ITapeOutCircuits, ITransistors, IBeaconOwner} from "./ITapeOut.sol";
import {NetlistPatch} from "./NetlistPatch.sol";

/// @notice Deploy steps shared by the scripts and the fork test. All functions are internal, so every call
///         leaves from the running script or test (the signing wallet under --broadcast).
library TapeoutFlow {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address internal constant BEM = 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952;
    address internal constant FROZEN_CIRCUIT_BEACON = 0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C;
    bytes32 internal constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    address internal constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address internal constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address internal constant USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;

    string internal constant NAME = "Atropyle";
    string internal constant SYMBOL = "ATRO";
    uint256 internal constant SUPPLY = 10_000;
    string internal constant STORY =
        "Atropyle: a frozen state-machine policy for non-custodial inheritance and wallet recovery on X Layer. "
        "KofN5 and Ge4 are public sub-circuits anyone can REF.";

    uint32 internal constant POLICY_IN = 23;
    uint32 internal constant POLICY_OUT = 3;
    uint32 internal constant POLICY_STATE = 3;

    struct CircuitFile {
        bytes netlist;
        uint32 nIn;
        uint32 nOut;
        uint256 nand;
        uint256 latch;
        uint32 gateCount;
    }

    function load(string memory file) internal view returns (CircuitFile memory c) {
        string memory json = _read(file);
        c.netlist = vm.parseJsonBytes(json, ".netlist");
        c.nIn = uint32(vm.parseJsonUint(json, ".nIn"));
        c.nOut = uint32(vm.parseJsonUint(json, ".nOut"));
        c.nand = vm.parseJsonUint(json, ".nand");
        c.latch = vm.parseJsonUint(json, ".latch");
        c.gateCount = uint32(vm.parseJsonUint(json, ".gateCount"));
    }

    function feeTokens() internal pure returns (address[] memory t) {
        t = new address[](3);
        t[0] = USDT0;
        t[1] = USDC;
        t[2] = USDG;
    }

    // ------------------------------------------------------------------ processor

    /// @dev Spec §10 step 1: approve deployFee in BEM, then createCPU(NAME, SYMBOL, STORY, 10000, 0).
    ///      createCPU returns (transistors, circuits); this returns the Circuits address.
    function createProcessor() internal returns (address created) {
        ITapeOutFactory f = ITapeOutFactory(FACTORY);
        require(f.bem() == BEM, "factory BEM changed");
        SafeERC20.forceApprove(IERC20(BEM), FACTORY, f.deployFee());
        (, created) = f.createCPU(NAME, SYMBOL, STORY, SUPPLY, 0);
    }

    /// @notice Accepts whatever createCPU returned (the Circuits or the Transistors) and returns the Circuits.
    function cpuOf(address created) internal view returns (address) {
        ITapeOutFactory f = ITapeOutFactory(FACTORY);
        if (f.isCPU(created)) return created;
        try ITransistors(created).circuits() returns (address c) {
            if (c != address(0) && f.isCPU(c)) return c;
        } catch {}
        uint256 n = f.cpuCount();
        for (uint256 i = n; i > 0 && i + 8 > n; --i) {
            address c = f.cpuAt(i - 1);
            if (ICPU(c).transistors() == created) return c;
        }
        revert("cpu not found");
    }

    /// @dev Spec §2: the processor must be ours and its circuits proxy must use the frozen beacon.
    function requireAtropyleCpu(address cpu, address creator) internal view {
        require(ITapeOutFactory(FACTORY).isCPU(cpu), "not a TapeOut CPU");
        ITapeOutCircuits c = ITapeOutCircuits(cpu);
        require(keccak256(bytes(c.name())) == keccak256(bytes(NAME)), "name");
        require(keccak256(bytes(c.symbol())) == keccak256(bytes(SYMBOL)), "symbol");
        ITransistors t = ITransistors(c.transistors());
        require(t.creator() == creator, "creator");
        require(t.circuits() == cpu, "transistors/circuits pair");
        address beacon = address(uint160(uint256(vm.load(cpu, BEACON_SLOT))));
        require(beacon == FROZEN_CIRCUIT_BEACON, "STOP: circuits beacon is not the frozen one (spec 2)");
        require(IBeaconOwner(beacon).owner() == address(0), "STOP: beacon has an owner (spec 2)");
    }

    // ------------------------------------------------------------------ circuits

    function tapeoutSubs(address cpu, address me, uint256 kofnId, uint256 ge4Id) internal returns (uint256, uint256) {
        if (kofnId == 0) kofnId = _tapeout(cpu, me, load("kofn5.json"));
        if (ge4Id == 0) ge4Id = _tapeout(cpu, me, load("ge4.json"));
        requireSubs(cpu, kofnId, ge4Id);
        return (kofnId, ge4Id);
    }

    function requireSubs(address cpu, uint256 kofnId, uint256 ge4Id) internal view {
        CircuitFile memory k = load("kofn5.json");
        _requireStored(cpu, kofnId, k.netlist, k.nIn, k.nOut, 0, k.gateCount);
        CircuitFile memory g = load("ge4.json");
        _requireStored(cpu, ge4Id, g.netlist, g.nIn, g.nOut, 0, g.gateCount);
    }

    function policyNetlist(address cpu, uint256 kofnId, uint256 ge4Id) internal view returns (bytes memory) {
        string memory json = _read("policy.template.json");
        return NetlistPatch.patch(
            vm.parseJsonBytes(json, ".netlist"),
            vm.parseJsonUintArray(json, ".refOffsets"),
            vm.parseJsonUintArray(json, ".refTargets"),
            cpu,
            [uint64(kofnId), uint64(ge4Id)]
        );
    }

    function tapeoutPolicy(address cpu, address me, uint256 kofnId, uint256 ge4Id)
        internal
        returns (uint256 policyId)
    {
        requireSubs(cpu, kofnId, ge4Id);
        CircuitFile memory p = load("policy.template.json");
        require(p.nIn == POLICY_IN && p.nOut == POLICY_OUT && p.latch == POLICY_STATE, "not policy-shaped");
        p.netlist = policyNetlist(cpu, kofnId, ge4Id);
        policyId = _tapeout(cpu, me, p);
        requirePolicy(cpu, policyId, kofnId, ge4Id, 64);
    }

    /// @notice Stored shape and bytes match the patched template, and the first `vectorCount` vectors replay.
    function requirePolicy(address cpu, uint256 policyId, uint256 kofnId, uint256 ge4Id, uint256 vectorCount)
        internal
        view
    {
        CircuitFile memory p = load("policy.template.json");
        _requireStored(
            cpu, policyId, policyNetlist(cpu, kofnId, ge4Id), POLICY_IN, POLICY_OUT, POLICY_STATE, p.gateCount
        );
        _requireVectors(cpu, policyId, vectorCount);
    }

    // ------------------------------------------------------------------ internals

    function _tapeout(address cpu, address me, CircuitFile memory c) private returns (uint256 id) {
        ITapeOutCircuits circ = ITapeOutCircuits(cpu);
        ITransistors t = ITransistors(circ.transistors());
        _mintDeficit(t, me, t.NAND(), c.nand);
        _mintDeficit(t, me, t.LATCH(), c.latch);
        id = circ.tapeout{value: circ.TAPEOUT_FEE()}(c.netlist, c.nIn, c.nOut);
    }

    /// @dev Mints only what `me` is missing, so a re-run after a partial failure costs nothing extra.
    function _mintDeficit(ITransistors t, address me, uint256 id, uint256 need) private {
        uint256 have = t.balanceOf(me, id);
        if (have >= need) return;
        uint256 amount = need - have;
        SafeERC20.forceApprove(IERC20(BEM), address(t), t.mintPrice() * amount + t.protocolFee());
        t.mint(id, amount);
    }

    function _requireStored(
        address cpu,
        uint256 id,
        bytes memory nl,
        uint32 nIn,
        uint32 nOut,
        uint32 nState,
        uint32 gateCount
    ) private view {
        (uint32 a, uint32 b, uint32 s, uint32 g) = ICPU(cpu).circuitInfo(id);
        require(a == nIn && b == nOut && s == nState && g == gateCount, "circuitInfo mismatch");
        require(keccak256(ICPU(cpu).netlist(id)) == keccak256(nl), "netlist mismatch");
    }

    function _requireVectors(address cpu, uint256 policyId, uint256 count) private view {
        string memory json = _read("vectors.json");
        uint256[] memory s = vm.parseJsonUintArray(json, ".states");
        uint256[] memory v = vm.parseJsonUintArray(json, ".inputs");
        uint256[] memory n = vm.parseJsonUintArray(json, ".next");
        uint256[] memory o = vm.parseJsonUintArray(json, ".out");
        require(count <= s.length, "not enough vectors");
        for (uint256 i; i < count; ++i) {
            (bytes memory ns, bytes memory out) =
                ICPU(cpu).step(policyId, _byte(s[i]), _word(v[i]));
            require(ns.length == 1 && uint8(ns[0]) == n[i], "vector next");
            require(out.length == 1 && uint8(out[0]) == o[i], "vector out");
        }
    }

    function _byte(uint256 x) private pure returns (bytes memory b) {
        b = new bytes(1);
        b[0] = bytes1(uint8(x));
    }

    function _word(uint256 w) private pure returns (bytes memory b) {
        b = new bytes(3);
        b[0] = bytes1(uint8(w));
        b[1] = bytes1(uint8(w >> 8));
        b[2] = bytes1(uint8(w >> 16));
    }

    function _read(string memory file) private view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/circuits/", file));
    }
}
