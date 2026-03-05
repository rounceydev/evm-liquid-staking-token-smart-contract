const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("WithdrawalQueueERC721", function () {
  let stakingPool, wstETH, withdrawalQueue, oracle;
  let admin, user1, user2, treasury;

  beforeEach(async function () {
    [admin, user1, user2, treasury, oracle] = await ethers.getSigners();

    // Deploy StakingPool
    const StakingPool = await ethers.getContractFactory("StakingPool");
    stakingPool = await upgrades.deployProxy(
      StakingPool,
      ["Liquid Staking Token", "stETH", admin.address, treasury.address, 1000],
      { initializer: "initialize" }
    );
    await stakingPool.waitForDeployment();

    // Deploy WstETH
    const WstETH = await ethers.getContractFactory("WstETH");
    wstETH = await upgrades.deployProxy(
      WstETH,
      [await stakingPool.getAddress(), admin.address],
      { initializer: "initialize" }
    );
    await wstETH.waitForDeployment();

    // Deploy WithdrawalQueue
    const WithdrawalQueue = await ethers.getContractFactory("WithdrawalQueueERC721");
    withdrawalQueue = await upgrades.deployProxy(
      WithdrawalQueue,
      [await stakingPool.getAddress(), await wstETH.getAddress(), admin.address],
      { initializer: "initialize" }
    );
    await withdrawalQueue.waitForDeployment();

    // Set withdrawal queue in staking pool
    await stakingPool.setWithdrawalQueue(await withdrawalQueue.getAddress());

    // Grant roles
    await stakingPool.grantRole(await stakingPool.ORACLE_ROLE(), oracle.address);
    await withdrawalQueue.grantRole(await withdrawalQueue.ORACLE_ROLE(), oracle.address);
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await withdrawalQueue.name()).to.equal("Unstaked Liquid Staking Token");
      expect(await withdrawalQueue.symbol()).to.equal("unstETH");
      expect(await withdrawalQueue.stakingPool()).to.equal(await stakingPool.getAddress());
    });
  });

  describe("Request Withdrawal (stETH)", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
    });

    it("Should create withdrawal request with stETH", async function () {
      const amount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);

      await expect(withdrawalQueue.connect(user1).requestWithdrawal(amount))
        .to.emit(withdrawalQueue, "WithdrawalRequested")
        .withArgs(user1.address, 1n, amount, false);

      expect(await withdrawalQueue.ownerOf(1)).to.equal(user1.address);
      const request = await withdrawalQueue.getWithdrawalRequest(1);
      expect(request.amount).to.equal(amount);
      expect(request.finalized).to.be.false;
      expect(request.claimable).to.be.false;
    });

    it("Should reject zero amount", async function () {
      await expect(withdrawalQueue.connect(user1).requestWithdrawal(0))
        .to.be.revertedWith("WithdrawalQueue: zero amount");
    });

    it("Should burn stETH shares when requesting", async function () {
      const amount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      const totalSharesBefore = await stakingPool.getTotalShares();
      
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
      await withdrawalQueue.connect(user1).requestWithdrawal(amount);

      const totalSharesAfter = await stakingPool.getTotalShares();
      expect(totalSharesAfter).to.equal(totalSharesBefore - shares);
    });
  });

  describe("Request Withdrawal (wstETH)", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const stETHAmount = ethers.parseEther("10.0");
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);
      await wstETH.connect(user1).wrap(stETHAmount);
    });

    it("Should create withdrawal request with wstETH", async function () {
      const wstETHAmount = ethers.parseEther("5.0");
      await wstETH.connect(user1).approve(await withdrawalQueue.getAddress(), wstETHAmount);

      await expect(withdrawalQueue.connect(user1).requestWithdrawalWstETH(wstETHAmount))
        .to.emit(withdrawalQueue, "WithdrawalRequested")
        .withArgs(user1.address, 1n, ethers.parseEther("5.0"), true);

      expect(await withdrawalQueue.ownerOf(1)).to.equal(user1.address);
    });
  });

  describe("Finalize Withdrawals", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const amount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
      await withdrawalQueue.connect(user1).requestWithdrawal(amount);
    });

    it("Should finalize withdrawal requests", async function () {
      const claimableAmount = ethers.parseEther("5.0");
      
      await expect(withdrawalQueue.connect(oracle).finalizeWithdrawals([1], [claimableAmount]))
        .to.emit(withdrawalQueue, "WithdrawalFinalized")
        .withArgs(1, claimableAmount);

      const request = await withdrawalQueue.getWithdrawalRequest(1);
      expect(request.finalized).to.be.true;
      expect(request.claimable).to.be.true;
      expect(await withdrawalQueue.getClaimableAmount(1)).to.equal(claimableAmount);
    });

    it("Should reject finalization from non-oracle", async function () {
      await expect(
        withdrawalQueue.connect(user1).finalizeWithdrawals([1], [ethers.parseEther("5.0")])
      ).to.be.revertedWithCustomError(withdrawalQueue, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Claim Withdrawals", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const amount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
      await withdrawalQueue.connect(user1).requestWithdrawal(amount);

      // Fund withdrawal queue with ETH
      await admin.sendTransaction({
        to: await withdrawalQueue.getAddress(),
        value: ethers.parseEther("5.0")
      });

      // Finalize
      await withdrawalQueue.connect(oracle).finalizeWithdrawals([1], [ethers.parseEther("5.0")]);
    });

    it("Should claim finalized withdrawal", async function () {
      const claimableAmount = ethers.parseEther("5.0");
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      await expect(withdrawalQueue.connect(user1).claimWithdrawal(1))
        .to.emit(withdrawalQueue, "WithdrawalClaimed")
        .withArgs(user1.address, 1, claimableAmount);

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter - balanceBefore).to.be.closeTo(claimableAmount, ethers.parseEther("0.01"));
      
      // NFT should be burned
      await expect(withdrawalQueue.ownerOf(1)).to.be.reverted;
    });

    it("Should reject claim from non-owner", async function () {
      await expect(withdrawalQueue.connect(user2).claimWithdrawal(1))
        .to.be.revertedWith("WithdrawalQueue: not owner");
    });

    it("Should reject claim of non-claimable request", async function () {
      // Create another request but don't finalize
      await stakingPool.connect(user2).submit({ value: ethers.parseEther("1.0") });
      const amount = ethers.parseEther("1.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      await stakingPool.connect(user2).approve(await withdrawalQueue.getAddress(), shares);
      await withdrawalQueue.connect(user2).requestWithdrawal(amount);

      await expect(withdrawalQueue.connect(user2).claimWithdrawal(2))
        .to.be.revertedWith("WithdrawalQueue: not claimable");
    });
  });

  describe("Queue Management", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
    });

    it("Should track pending requests", async function () {
      const amount = ethers.parseEther("1.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      
      for (let i = 0; i < 3; i++) {
        await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
        await withdrawalQueue.connect(user1).requestWithdrawal(amount);
      }

      expect(await withdrawalQueue.getPendingRequestCount()).to.equal(3);
      const pending = await withdrawalQueue.getPendingRequests(0, 10);
      expect(pending.length).to.equal(3);
    });
  });
});
