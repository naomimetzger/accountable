import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import hre from "hardhat";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { expect } from "chai";

const TASK_COFHE_MOCKS_DEPLOY = "task:cofhe-mocks:deploy";

describe("Accountability", function () {
  async function deployAccountabilityFixture() {
    await hre.run(TASK_COFHE_MOCKS_DEPLOY);

    const [signer, bob, alice, charlie] = await hre.ethers.getSigners();

    const Accountability = await hre.ethers.getContractFactory("Accountability");
    const accountability = await Accountability.connect(bob).deploy();

    const client = await hre.cofhe.createClientWithBatteries(bob);

    return { accountability, signer, bob, alice, charlie, client };
  }

  describe("Groups", function () {
    it("creates a group, deduplicates members, and includes the creator", async function () {
      const { accountability, bob, alice, charlie } = await loadFixture(
        deployAccountabilityFixture,
      );

      const groupId = await accountability
        .connect(bob)
        .createGroup.staticCall("Friends", [alice.address, charlie.address, alice.address]);

      await accountability
        .connect(bob)
        .createGroup("Friends", [alice.address, charlie.address, alice.address]);

      expect(groupId).to.equal(0n);
      expect(await accountability.getGroupName(groupId)).to.equal("Friends");
      expect(await accountability.isMember(groupId, bob.address)).to.equal(true);
      expect(await accountability.isMember(groupId, alice.address)).to.equal(true);
      expect(await accountability.isMember(groupId, charlie.address)).to.equal(true);

      const members = await accountability.getMembers(groupId);
      expect(members).to.deep.equal([alice.address, charlie.address, bob.address]);
    });

    it("stores encrypted goals, exposes completion status, and allows completion", async function () {
      const { accountability, bob, alice, client } = await loadFixture(
        deployAccountabilityFixture,
      );

      const groupId = await accountability
        .connect(bob)
        .createGroup.staticCall("Habits", [alice.address]);
      await accountability.connect(bob).createGroup("Habits", [alice.address]);

      const encryptedGoals = await client
        .encryptInputs([Encryptable.uint64(10n), Encryptable.uint64(25n)])
        .execute();

      await accountability.connect(bob).setGoals(groupId, encryptedGoals);

      const goals = await accountability.getGoals(groupId, bob.address);
      const decryptedGoals = await Promise.all(
        goals.map((goal) => client.decryptForView(goal, FheTypes.Uint64).execute()),
      );
      expect(decryptedGoals).to.deep.equal([10n, 25n]);

      expect(await accountability.getCompletionStatus(groupId, bob.address)).to.deep.equal([
        false,
        false,
      ]);

      await accountability.connect(bob).completeGoal(groupId, 1);

      expect(await accountability.getCompletionStatus(groupId, bob.address)).to.deep.equal([
        false,
        true,
      ]);
    });
  });

  describe("Reset and leaderboard", function () {
    it("resets existing goals when goals are replaced", async function () {
      const { accountability, bob, alice, client } = await loadFixture(
        deployAccountabilityFixture,
      );

      const groupId = await accountability
        .connect(bob)
        .createGroup.staticCall("Resettable", [alice.address]);
      await accountability.connect(bob).createGroup("Resettable", [alice.address]);

      const initialGoals = await client
        .encryptInputs([Encryptable.uint64(1n), Encryptable.uint64(2n)])
        .execute();
      await accountability.connect(bob).setGoals(groupId, initialGoals);
      await accountability.connect(bob).completeGoal(groupId, 0);

      const replacementGoals = await client
        .encryptInputs([Encryptable.uint64(99n)])
        .execute();
      await accountability.connect(bob).setGoals(groupId, replacementGoals);

      expect(await accountability.getCompletionStatus(groupId, bob.address)).to.deep.equal([
        false,
      ]);

      const goals = await accountability.getGoals(groupId, bob.address);
      const decryptedGoals = await Promise.all(
        goals.map((goal) => client.decryptForView(goal, FheTypes.Uint64).execute()),
      );
      expect(decryptedGoals).to.deep.equal([99n]);
    });

    it("ranks members by completed goals", async function () {
      const { accountability, bob, alice, charlie, client } = await loadFixture(
        deployAccountabilityFixture,
      );
      const aliceClient = await hre.cofhe.createClientWithBatteries(alice);

      const groupId = await accountability
        .connect(bob)
        .createGroup.staticCall("Ranking", [alice.address, charlie.address]);
      await accountability.connect(bob).createGroup("Ranking", [alice.address, charlie.address]);

      const bobGoals = await client
        .encryptInputs([Encryptable.uint64(1n), Encryptable.uint64(2n)])
        .execute();
      await accountability.connect(bob).setGoals(groupId, bobGoals);
      await accountability.connect(bob).completeGoal(groupId, 0);
      await accountability.connect(bob).completeGoal(groupId, 1);

      const aliceGoals = await aliceClient
        .encryptInputs([Encryptable.uint64(3n)])
        .execute();
      await accountability.connect(alice).setGoals(groupId, aliceGoals);
      await accountability.connect(alice).completeGoal(groupId, 0);

      const leaderboard = await accountability.getLeaderboard(groupId);
      expect(leaderboard.rankedMembers).to.deep.equal([
        bob.address,
        alice.address,
        charlie.address,
      ]);
      expect(leaderboard.counts).to.deep.equal([2n, 1n, 0n]);
    });
  });
});
