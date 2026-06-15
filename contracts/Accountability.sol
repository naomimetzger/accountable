// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title acc*untable — encrypted accountability groups
/// @notice Goals are FHE-encrypted (only the owner can decrypt them).
///         Completion flags are public so friends see ✓/✗ without
///         seeing what the goal actually was.
contract Accountability {
    struct Group {
        string name;
        address[] members;
        mapping(address => bool) isMemberMap;
        mapping(address => euint64[]) goals;       // encrypted, owner-only
        mapping(address => bool[]) completions;    // public ✓/✗
        bool exists;
    }

    mapping(uint256 => Group) private groups;
    uint256 public groupCount;

    event GroupCreated(uint256 indexed groupId, address indexed creator, string name);
    event GoalsSet(uint256 indexed groupId, address indexed member, uint256 count);
    event GoalCompleted(uint256 indexed groupId, address indexed member, uint8 goalIndex);

    // --- Create a group -------------------------------------------------

    function createGroup(string calldata name, address[] calldata members)
        external
        returns (uint256 groupId)
    {
        groupId = groupCount++;
        Group storage g = groups[groupId];
        g.name = name;
        g.exists = true;

        for (uint256 i = 0; i < members.length; i++) {
            if (!g.isMemberMap[members[i]]) {
                g.isMemberMap[members[i]] = true;
                g.members.push(members[i]);
            }
        }
        // creator is always a member
        if (!g.isMemberMap[msg.sender]) {
            g.isMemberMap[msg.sender] = true;
            g.members.push(msg.sender);
        }

        emit GroupCreated(groupId, msg.sender, name);
    }

    // --- Set your encrypted goals --------------------------------------

    function setGoals(uint256 groupId, InEuint64[] calldata encryptedGoals) external {
        Group storage g = groups[groupId];
        require(g.exists, "Group does not exist");
        require(g.isMemberMap[msg.sender], "Not a member");

        // reset any previous goals + completion flags for this member
        delete g.goals[msg.sender];
        delete g.completions[msg.sender];

        for (uint256 i = 0; i < encryptedGoals.length; i++) {
            euint64 goal = FHE.asEuint64(encryptedGoals[i]);
            FHE.allowThis(goal);    // contract may reference the handle
            FHE.allowSender(goal);  // ONLY the owner can decrypt -> privacy
            g.goals[msg.sender].push(goal);
            g.completions[msg.sender].push(false);
        }

        emit GoalsSet(groupId, msg.sender, encryptedGoals.length);
    }

    // --- Mark a goal complete (public) ---------------------------------

    function completeGoal(uint256 groupId, uint8 goalIndex) external {
        Group storage g = groups[groupId];
        require(g.exists, "Group does not exist");
        require(g.isMemberMap[msg.sender], "Not a member");
        require(goalIndex < g.completions[msg.sender].length, "Invalid goal index");

        g.completions[msg.sender][goalIndex] = true;
        emit GoalCompleted(groupId, msg.sender, goalIndex);
    }

    // --- Reads ----------------------------------------------------------

    /// @notice Public ✓/✗ flags for a member. Anyone can read these.
    function getCompletionStatus(uint256 groupId, address member)
        external
        view
        returns (bool[] memory)
    {
        return groups[groupId].completions[member];
    }

    /// @notice Encrypted goal handles for a member. Handles are public, but
    ///         only the owner (granted via allowSender) can decrypt them
    ///         off-chain through CoFHE.
    function getGoals(uint256 groupId, address member)
        external
        view
        returns (euint64[] memory)
    {
        return groups[groupId].goals[member];
    }

    /// @notice Members ranked by number of completed goals, highest first.
    function getLeaderboard(uint256 groupId)
        external
        view
        returns (address[] memory rankedMembers, uint256[] memory counts)
    {
        Group storage g = groups[groupId];
        uint256 n = g.members.length;

        rankedMembers = new address[](n);
        counts = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            rankedMembers[i] = g.members[i];
            counts[i] = _countCompletions(g, g.members[i]);
        }

        // selection sort, descending by count (fine for small friend groups)
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (counts[j] > counts[i]) {
                    (counts[i], counts[j]) = (counts[j], counts[i]);
                    (rankedMembers[i], rankedMembers[j]) = (rankedMembers[j], rankedMembers[i]);
                }
            }
        }
    }

    function isMember(uint256 groupId, address wallet) external view returns (bool) {
        return groups[groupId].isMemberMap[wallet];
    }

    function getMembers(uint256 groupId) external view returns (address[] memory) {
        return groups[groupId].members;
    }

    function getGroupName(uint256 groupId) external view returns (string memory) {
        return groups[groupId].name;
    }

    // --- Internal -------------------------------------------------------

    function _countCompletions(Group storage g, address member)
        internal
        view
        returns (uint256 count)
    {
        bool[] storage c = g.completions[member];
        for (uint256 i = 0; i < c.length; i++) {
            if (c[i]) count++;
        }
    }
}