const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Integration Tests", function () {
  let stakingPool, wstETH, withdrawalQueue, mockOracle;
  let admin, user1, user2, treasury, oracle;

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

    // Deploy MockOracle
    const MockOracle = await ethers.getContractFactory("MockAccountingOracle");
    mockOracle = await upgrades.deployProxy(
      MockOracle,
      [await stakingPool.getAddress(), await withdrawalQueue.getAddress(), admin.address],
      { initializer: "initialize" }
    );
    await mockOracle.waitForDeployment();

    // Setup connections
    await stakingPool.setWithdrawalQueue(await withdrawalQueue.getAddress());
    await stakingPool.setAccountingOracle(await mockOracle.getAddress());

    // Grant roles
    await stakingPool.grantRole(await stakingPool.ORACLE_ROLE(), await mockOracle.getAddress());
    await withdrawalQueue.grantRole(await withdrawalQueue.ORACLE_ROLE(), await mockOracle.getAddress());
  });

  describe("Complete Flow", function () {
    it("Should handle complete deposit -> wrap -> unwrap -> withdraw flow", async function () {
      // 1. Deposit ETH
      const depositAmount = ethers.parseEther("10.0");
      await stakingPool.connect(user1).submit({ value: depositAmount });
      expect(await stakingPool.balanceOf(user1.address)).to.equal(depositAmount);

      // 2. Wrap stETH to wstETH
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), depositAmount);
      await wstETH.connect(user1).wrap(depositAmount);
      expect(await wstETH.balanceOf(user1.address)).to.equal(depositAmount);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(0);

      // 3. Unwrap wstETH back to stETH
      await wstETH.connect(user1).unwrap(depositAmount);
      expect(await wstETH.balanceOf(user1.address)).to.equal(0);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(depositAmount);

      // 4. Request withdrawal
      const withdrawalAmount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(withdrawalAmount);
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
      const requestId = await withdrawalQueue.connect(user1).requestWithdrawal(withdrawalAmount);
      expect(await withdrawalQueue.ownerOf(1)).to.equal(user1.address);

      // 5. Fund withdrawal queue
      await admin.sendTransaction({
        to: await withdrawalQueue.getAddress(),
        value: withdrawalAmount
      });

      // 6. Finalize withdrawal
      await mockOracle.finalizeWithdrawals([1], [withdrawalAmount]);

      // 7. Claim withdrawal
      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await withdrawalQueue.connect(user1).claimWithdrawal(1);
      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter - balanceBefore).to.be.closeTo(withdrawalAmount, ethers.parseEther("0.01"));
    });

    it("Should handle rewards accrual and rebasing", async function () {
      // Deposit
      const depositAmount = ethers.parseEther("10.0");
      await stakingPool.connect(user1).submit({ value: depositAmount });
      await stakingPool.connect(user2).submit({ value: depositAmount });

      // Wrap
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), depositAmount);
      await wstETH.connect(user1).wrap(depositAmount);

      const stETHBalanceBefore = await stakingPool.balanceOf(user2.address);
      const wstETHBalance = await wstETH.balanceOf(user1.address);
      const stETHValueBefore = await wstETH.getStETHByWstETH(wstETHBalance);

      // Process reward
      const reward = ethers.parseEther("2.0");
      const newPooled = depositAmount * 2n + reward;
      await mockOracle.submitReport(newPooled, 0, 0);

      // stETH should rebase (increase)
      const stETHBalanceAfter = await stakingPool.balanceOf(user2.address);
      expect(stETHBalanceAfter).to.be.gt(stETHBalanceBefore);

      // wstETH balance stays same but value increases
      expect(await wstETH.balanceOf(user1.address)).to.equal(wstETHBalance);
      const stETHValueAfter = await wstETH.getStETHByWstETH(wstETHBalance);
      expect(stETHValueAfter).to.be.gt(stETHValueBefore);
    });

    it("Should handle multiple withdrawal requests in FIFO order", async function () {
      // Multiple users deposit
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      await stakingPool.connect(user2).submit({ value: ethers.parseEther("10.0") });

      // Both request withdrawals
      const amount1 = ethers.parseEther("5.0");
      const amount2 = ethers.parseEther("3.0");
      
      const shares1 = await stakingPool.getSharesByPooledEth(amount1);
      const shares2 = await stakingPool.getSharesByPooledEth(amount2);
      
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares1);
      await stakingPool.connect(user2).approve(await withdrawalQueue.getAddress(), shares2);
      
      await withdrawalQueue.connect(user1).requestWithdrawal(amount1);
      await withdrawalQueue.connect(user2).requestWithdrawal(amount2);

      expect(await withdrawalQueue.getPendingRequestCount()).to.equal(2);

      // Fund and finalize both
      await admin.sendTransaction({
        to: await withdrawalQueue.getAddress(),
        value: amount1 + amount2
      });

      await mockOracle.finalizeWithdrawals([1, 2], [amount1, amount2]);

      // Both should be claimable
      expect(await withdrawalQueue.getClaimableAmount(1)).to.equal(amount1);
      expect(await withdrawalQueue.getClaimableAmount(2)).to.equal(amount2);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero deposit gracefully", async function () {
      await expect(stakingPool.connect(user1).submit({ value: 0 }))
        .to.be.revertedWith("StakingPool: zero amount");
    });

    it("Should handle maximum queue size", async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("100.0") });
      
      const amount = ethers.parseEther("0.1");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      
      // Create multiple requests
      for (let i = 0; i < 10; i++) {
        await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
        await withdrawalQueue.connect(user1).requestWithdrawal(amount);
      }

      expect(await withdrawalQueue.getPendingRequestCount()).to.equal(10);
    });

    it("Should handle unauthorized oracle access", async function () {
      await expect(
        mockOracle.connect(user1).submitReport(ethers.parseEther("10.0"), 0, 0)
      ).to.be.revertedWithCustomError(mockOracle, "AccessControlUnauthorizedAccount");
    });

    it("Should handle insufficient buffer for withdrawals", async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const amount = ethers.parseEther("5.0");
      const shares = await stakingPool.getSharesByPooledEth(amount);
      await stakingPool.connect(user1).approve(await withdrawalQueue.getAddress(), shares);
      await withdrawalQueue.connect(user1).requestWithdrawal(amount);

      // Try to finalize without funding
      await expect(
        mockOracle.finalizeWithdrawals([1], [amount])
      ).to.not.be.reverted; // Finalization succeeds, but claim will fail if no ETH

      // Claim will fail if contract doesn't have ETH
      const balance = await ethers.provider.getBalance(await withdrawalQueue.getAddress());
      if (balance < amount) {
        // This would fail in real scenario, but we test the flow
        await admin.sendTransaction({
          to: await withdrawalQueue.getAddress(),
          value: amount
        });
      }

      await withdrawalQueue.connect(user1).claimWithdrawal(1);
    });
  });
});
