// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DewebCalls} from "../script/lib/DewebCalls.sol";
import {DewebPublish} from "../script/07_DewebPublish.s.sol";

/// @dev Stands in for the SiteRegistry at its real address: it records every call and who sent it.
contract RecordingRegistry {
    bytes[] internal received;
    address[] internal senders;
    bool public failing;

    function setFailing(bool f) external {
        failing = f;
    }

    function count() external view returns (uint256) {
        return received.length;
    }

    function callAt(uint256 i) external view returns (address sender, bytes memory data) {
        return (senders[i], received[i]);
    }

    fallback() external {
        require(!failing, "registry says no");
        received.push(msg.data);
        senders.push(msg.sender);
    }
}

/// @dev External wrapper so vm.expectRevert sees the library revert one call deeper.
contract CallsHarness {
    function requirePath(string memory rel) external pure {
        DewebCalls.requirePath(rel);
    }

    function load(string memory rel) external view returns (DewebCalls.File memory) {
        return DewebCalls.load(rel);
    }

    function check(DewebCalls.File memory f, uint256 chainid) external pure {
        DewebCalls.check(f, chainid);
    }
}

contract DewebPublishTest is Test {
    address internal constant CONTAINER = 0x97abE83C61003674451C35441c02CC3D7ad2c1e3;
    address internal constant OTHER = 0x632910a79EeE7fA99e99695510aA95dDee6ef771;
    address internal constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    string internal constant GOOD = "deweb-calls/test/good.json";

    CallsHarness internal h;
    DewebPublish internal script;
    RecordingRegistry internal registry = RecordingRegistry(DewebCalls.REGISTRY);

    function setUp() public {
        h = new CallsHarness();
        script = new DewebPublish();
        vm.etch(DewebCalls.REGISTRY, address(new RecordingRegistry()).code);
        vm.chainId(196);
    }

    // ---------- the calls the TS side wrote (scripts/test/site/deweb.test.ts writes the same bytes) ----------

    function _expected() internal pure returns (bytes[] memory want) {
        bytes memory head = "<!doctype html><title>Atropyle</title>";
        bytes memory tail = "<p>tail</p>";
        want = new bytes[](4);
        want[0] = abi.encodeWithSelector(
            DewebCalls.PUTFILE,
            CONTAINER,
            "index.html",
            "text/html; charset=utf-8",
            sha256(bytes.concat(head, tail)),
            head
        );
        want[1] = abi.encodeWithSelector(DewebCalls.APPENDCHUNK, CONTAINER, "index.html", uint256(1), tail);
        want[2] = abi.encodeWithSelector(DewebCalls.REMOVEFILE, CONTAINER, "old.js");
        want[3] = abi.encodeWithSelector(DewebCalls.SETFALLBACK, CONTAINER, "index.html");
    }

    function test_publishSendsEveryCallInOrderFromOneSender() public {
        script.publish(GOOD);
        bytes[] memory want = _expected();
        assertEq(registry.count(), want.length);
        (address first,) = registry.callAt(0);
        assertTrue(first != address(script), "the broadcaster sends, not the script contract");
        for (uint256 i; i < want.length; ++i) {
            (address sender, bytes memory data) = registry.callAt(i);
            assertEq(sender, first);
            assertEq(data, want[i]);
        }
    }

    function test_runReadsTheFileNamedByDEWEB_CALLS() public {
        vm.setEnv("DEWEB_CALLS", GOOD);
        script.run();
        assertEq(registry.count(), 4);
    }

    function test_loadParsesTheEmittedFile() public view {
        DewebCalls.File memory f = h.load(GOOD);
        assertEq(f.chainId, 196);
        assertEq(f.registry, DewebCalls.REGISTRY);
        assertEq(f.binding, DewebCalls.BINDING);
        assertEq(f.container, CONTAINER);
        bytes[] memory want = _expected();
        assertEq(f.calls.length, want.length);
        for (uint256 i; i < want.length; ++i) {
            assertEq(f.calls[i].to, DewebCalls.REGISTRY);
            assertEq(f.calls[i].value, 0);
            assertEq(f.calls[i].data, want[i]);
        }
    }

    // ---------- refusals ----------

    function test_publishRefusesAnotherChain() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.WrongChain.selector, 196, 31337));
        script.publish(GOOD);
        assertEq(registry.count(), 0);
    }

    function test_publishStopsWhenACallReverts() public {
        registry.setFailing(true);
        vm.expectRevert(
            abi.encodeWithSelector(
                DewebCalls.CallFailed.selector, 0, abi.encodeWithSignature("Error(string)", "registry says no")
            )
        );
        script.publish(GOOD);
    }

    function test_publishRefusesAPathOutsideDewebCalls() public {
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadPath.selector, "deweb-calls/../foundry.toml"));
        script.publish("deweb-calls/../foundry.toml");
    }

    function test_publishRefusesAnEmptyFile() public {
        vm.expectRevert(DewebCalls.NoCalls.selector);
        script.publish("deweb-calls/test/empty.json");
    }

    function test_pathMustStayUnderDewebCalls() public {
        string[12] memory bad = [
            "deweb-calls/../foundry.toml",
            "deweb-calls/test/../../foundry.toml",
            "deweb-calls/..",
            "../deweb-calls/x.json",
            "circuits/policy.json",
            "/etc/passwd.json",
            "deweb-calls\\x.json",
            "deweb-calls/x.txt",
            "deweb-calls/.json",
            "deweb-calls/test/.json",
            "deweb-calls/a b.json",
            "deweb-calls/x.json\x00"
        ];
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadPath.selector, bad[i]));
            h.requirePath(bad[i]);
        }
        h.requirePath("deweb-calls/site.json");
        h.requirePath(GOOD);
    }

    function test_loadRefusesADuplicateKey() public {
        // A second "registry" naming a token contract: the file must be the exact output of --emit.
        vm.expectRevert(DewebCalls.NotCanonicalJson.selector);
        h.load("deweb-calls/test/dup-key.json");
    }

    function test_loadRefusesTrailingBytesAfterTheCalls() public {
        vm.expectRevert(DewebCalls.NotCanonicalCalls.selector);
        h.load("deweb-calls/test/trailing.json");
    }

    // The JSON of these two is canonical, so they get past the text check: abi.decode itself reverts, with no data.
    function test_loadRefusesATruncatedArray() public {
        vm.expectRevert(bytes(""));
        h.load("deweb-calls/test/short.json");
    }

    function test_loadRefusesAnArrayLongerThanItsData() public {
        vm.expectRevert(bytes(""));
        h.load("deweb-calls/test/count.json");
    }

    // ---------- check(): what the signing account may send ----------

    function _file(DewebCalls.Call[] memory calls) internal pure returns (DewebCalls.File memory f) {
        f = DewebCalls.File(196, DewebCalls.REGISTRY, DewebCalls.BINDING, CONTAINER, calls);
    }

    function _one(address to, uint256 value, bytes memory data) internal pure returns (DewebCalls.Call[] memory c) {
        c = new DewebCalls.Call[](1);
        c[0] = DewebCalls.Call(to, value, data);
    }

    function _put(address container) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(DewebCalls.PUTFILE, container, "a.js", "text/javascript", bytes32(0), hex"00");
    }

    function _bind(address container) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(DewebCalls.BIND, "1.2.396.tape", container, uint256(120));
    }

    function test_checkAcceptsRegistryWritesAndABind() public view {
        bytes[] memory want = _expected();
        DewebCalls.Call[] memory c = new DewebCalls.Call[](want.length + 1);
        for (uint256 i; i < want.length; ++i) {
            c[i] = DewebCalls.Call(DewebCalls.REGISTRY, 0, want[i]);
        }
        c[want.length] = DewebCalls.Call(DewebCalls.BINDING, 0, _bind(CONTAINER));
        h.check(_file(c), 196);
    }

    function test_checkRefusesAnotherChain() public {
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.WrongChain.selector, 196, 1));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, _put(CONTAINER))), 1);
    }

    function test_checkRefusesATargetThatIsNeitherTheRegistryNorTheBinding() public {
        bytes memory transfer = abi.encodeWithSignature("transfer(address,uint256)", OTHER, 1e6);
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadTarget.selector, 0, USDT0));
        h.check(_file(_one(USDT0, 0, transfer)), 196);
    }

    function test_checkRefusesAFileThatNamesAnotherRegistryOrBinding() public {
        DewebCalls.File memory f = _file(_one(USDT0, 0, _put(CONTAINER)));
        f.registry = USDT0;
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.NotDeweb.selector, USDT0, DewebCalls.BINDING));
        h.check(f, 196);

        f = _file(_one(USDT0, 0, _bind(CONTAINER)));
        f.binding = USDT0;
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.NotDeweb.selector, DewebCalls.REGISTRY, USDT0));
        h.check(f, 196);
    }

    function test_checkRefusesValue() public {
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.SendsValue.selector, 0));
        h.check(_file(_one(DewebCalls.REGISTRY, 1, _put(CONTAINER))), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.SendsValue.selector, 0));
        h.check(_file(_one(DewebCalls.BINDING, 1 ether, _bind(CONTAINER))), 196);
    }

    function test_checkRefusesOtherFunctions() public {
        // setOperator(container, operator, ttl) would hand the container to someone else.
        bytes memory setOperator = abi.encodeWithSelector(bytes4(0xc88cb026), CONTAINER, OTHER, uint256(1e9));
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadSelector.selector, 0, bytes4(0xc88cb026)));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, setOperator)), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadSelector.selector, 0, DewebCalls.PUTFILE));
        h.check(_file(_one(DewebCalls.BINDING, 0, _put(CONTAINER))), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.BadSelector.selector, 0, DewebCalls.BIND));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, _bind(CONTAINER))), 196);
    }

    function test_checkRefusesAnotherContainer() public {
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.WrongContainer.selector, 0));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, _put(OTHER))), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.WrongContainer.selector, 0));
        h.check(_file(_one(DewebCalls.BINDING, 0, _bind(OTHER))), 196);

        // An address word with dirty high bits is not the container either.
        bytes memory dirty = _put(CONTAINER);
        dirty[4] = 0x01;
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.WrongContainer.selector, 0));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, dirty)), 196);
    }

    function test_checkRefusesShortCalldata() public {
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.ShortCall.selector, 0));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, "")), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.ShortCall.selector, 0));
        h.check(_file(_one(DewebCalls.REGISTRY, 0, abi.encodePacked(DewebCalls.PUTFILE, bytes31(0)))), 196);

        vm.expectRevert(abi.encodeWithSelector(DewebCalls.ShortCall.selector, 0));
        h.check(_file(_one(DewebCalls.BINDING, 0, abi.encodePacked(DewebCalls.BIND, bytes32(0)))), 196);
    }

    function test_checkRefusesNoCallsAndNoContainer() public {
        vm.expectRevert(DewebCalls.NoCalls.selector);
        h.check(_file(new DewebCalls.Call[](0)), 196);

        DewebCalls.File memory f = _file(_one(DewebCalls.REGISTRY, 0, _put(address(0))));
        f.container = address(0);
        vm.expectRevert(DewebCalls.NoContainer.selector);
        h.check(f, 196);
    }

    function test_checkNamesTheFirstBadCall() public {
        DewebCalls.Call[] memory c = new DewebCalls.Call[](3);
        c[0] = DewebCalls.Call(DewebCalls.REGISTRY, 0, _put(CONTAINER));
        c[1] = DewebCalls.Call(DewebCalls.BINDING, 0, _bind(CONTAINER));
        c[2] = DewebCalls.Call(DewebCalls.REGISTRY, 5, _put(CONTAINER));
        vm.expectRevert(abi.encodeWithSelector(DewebCalls.SendsValue.selector, 2));
        h.check(_file(c), 196);
    }
}
