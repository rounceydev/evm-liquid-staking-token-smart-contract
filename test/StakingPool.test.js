const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("StakingPool", function () {
  let stakingPool;
  let admin, user1, user2, treasury, oracle;
  const INITIAL_TREASURY_FEE = 1000; // 10%

  beforeEach(async function () {
    [admin, user1, user2, treasury, oracle] = await ethers.getSigners();

    const StakingPool = await ethers.getContractFactory("StakingPool");
    stakingPool = await upgrades.deployProxy(
      StakingPool,
      ["Liquid Staking Token", "stETH", admin.address, treasury.address, INITIAL_TREASURY_FEE],
      { initializer: "initialize" }
    );
    await stakingPool.waitForDeployment();

    // Grant oracle role
    await stakingPool.grantRole(await stakingPool.ORACLE_ROLE(), oracle.address);
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await stakingPool.name()).to.equal("Liquid Staking Token");
      expect(await stakingPool.symbol()).to.equal("stETH");
      expect(await stakingPool.getTreasuryFee()).to.equal(INITIAL_TREASURY_FEE);
      expect(await stakingPool.getTotalPooledEther()).to.equal(0);
      expect(await stakingPool.getTotalShares()).to.equal(0);
    });

    it("Should reject zero admin address", async function () {
      const StakingPool = await ethers.getContractFactory("StakingPool");
      await expect(
        upgrades.deployProxy(
          StakingPool,
          ["Liquid Staking Token", "stETH", ethers.ZeroAddress, treasury.address, INITIAL_TREASURY_FEE],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("StakingPool: zero admin address");
    });

    it("Should reject fee too high", async function () {
      const StakingPool = await ethers.getContractFactory("StakingPool");
      await expect(
        upgrades.deployProxy(
          StakingPool,
          ["Liquid Staking Token", "stETH", admin.address, treasury.address, 5001],
          { initializer: "initialize" }
        )
      ).to.be.revertedWith("StakingPool: fee too high");
    });
  });

  describe("Deposits", function () {
    it("Should accept ETH deposits and mint shares", async function () {
      const depositAmount = ethers.parseEther("1.0");
      await expect(stakingPool.connect(user1).submit({ value: depositAmount }))
        .to.emit(stakingPool, "Submitted")
        .withArgs(user1.address, depositAmount, depositAmount);

      expect(await stakingPool.getTotalPooledEther()).to.equal(depositAmount);
      expect(await stakingPool.getTotalShares()).to.equal(depositAmount);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(depositAmount);
    });

    it("Should reject zero deposits", async function () {
      await expect(stakingPool.connect(user1).submit({ value: 0 }))
        .to.be.revertedWith("StakingPool: zero amount");
    });

    it("Should handle multiple deposits correctly", async function () {
      const deposit1 = ethers.parseEther("1.0");
      const deposit2 = ethers.parseEther("2.0");

      await stakingPool.connect(user1).submit({ value: deposit1 });
      await stakingPool.connect(user2).submit({ value: deposit2 });

      expect(await stakingPool.getTotalPooledEther()).to.equal(deposit1 + deposit2);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(deposit1);
      expect(await stakingPool.balanceOf(user2.address)).to.equal(deposit2);
    });

    it("Should be paused and reject deposits when paused", async function () {
      await stakingPool.pause();
      await expect(stakingPool.connect(user1).submit({ value: ethers.parseEther("1.0") }))
        .to.be.revertedWithCustomError(stakingPool, "EnforcedPause");
    });
  });

  describe("Shares Mechanics", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("1.0") });
    });

    it("Should calculate shares correctly", async function () {
      const ethAmount = ethers.parseEther("2.0");
      const shares = await stakingPool.getSharesByPooledEth(ethAmount);
      expect(shares).to.equal(ethers.parseEther("2.0"));
    });

    it("Should calculate ETH from shares correctly", async function () {
      const shares = ethers.parseEther("0.5");
      const ethAmount = await stakingPool.getPooledEthByShares(shares);
      expect(ethAmount).to.equal(ethers.parseEther("0.5"));
    });

    it("Should maintain 1:1 ratio initially", async function () {
      const exchangeRate = await stakingPool.getExchangeRate();
      expect(exchangeRate).to.equal(ethers.parseEther("1.0"));
    });
  });

  describe("Oracle Reports", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
    });

    it("Should process oracle report and accrue rewards", async function () {
      const initialPooled = await stakingPool.getTotalPooledEther();
      const newPooled = initialPooled + ethers.parseEther("1.0"); // 1 ETH reward

      await expect(
        stakingPool.connect(oracle).processOracleReport(newPooled, 0, 0)
      ).to.emit(stakingPool, "OracleReportProcessed");

      expect(await stakingPool.getTotalPooledEther()).to.be.closeTo(
        newPooled - (ethers.parseEther("1.0") * BigInt(INITIAL_TREASURY_FEE) / 10000n),
        ethers.parseEther("0.001")
      );
    });

    it("Should deduct treasury fee from rewards", async function () {
      const reward = ethers.parseEther("1.0");
      const initialPooled = await stakingPool.getTotalPooledEther();
      const newPooled = initialPooled + reward;
      const expectedFee = (reward * BigInt(INITIAL_TREASURY_FEE)) / 10000n;

      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      await stakingPool.connect(oracle).processOracleReport(newPooled, 0, 0);
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(expectedFee);
    });

    it("Should reject oracle report from non-oracle", async function () {
      await expect(
        stakingPool.connect(user1).processOracleReport(ethers.parseEther("11.0"), 0, 0)
      ).to.be.revertedWithCustomError(stakingPool, "AccessControlUnauthorizedAccount");
    });

    it("Should reject invalid oracle report", async function () {
      const initialPooled = await stakingPool.getTotalPooledEther();
      await expect(
        stakingPool.connect(oracle).processOracleReport(initialPooled - ethers.parseEther("1.0"), 0, 0)
      ).to.be.revertedWith("StakingPool: invalid report");
    });
  });

  describe("Governance", function () {
    it("Should update treasury fee", async function () {
      const newFee = 2000; // 20%
      await expect(stakingPool.setTreasuryFee(newFee))
        .to.emit(stakingPool, "TreasuryFeeUpdated")
        .withArgs(INITIAL_TREASURY_FEE, newFee);
      expect(await stakingPool.getTreasuryFee()).to.equal(newFee);
    });

    it("Should reject fee too high", async function () {
      await expect(stakingPool.setTreasuryFee(5001))
        .to.be.revertedWith("StakingPool: fee too high");
    });

    it("Should update treasury address", async function () {
      await expect(stakingPool.setTreasury(user1.address))
        .to.emit(stakingPool, "TreasuryUpdated")
        .withArgs(treasury.address, user1.address);
    });

    it("Should set withdrawal queue", async function () {
      await expect(stakingPool.setWithdrawalQueue(user1.address))
        .to.emit(stakingPool, "WithdrawalQueueUpdated")
        .withArgs(ethers.ZeroAddress, user1.address);
    });

    it("Should reject unauthorized governance actions", async function () {
      await expect(stakingPool.connect(user1).setTreasuryFee(2000))
        .to.be.revertedWithCustomError(stakingPool, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Rebasing", function () {
    it("Should rebase balances after rewards", async function () {
      const deposit = ethers.parseEther("10.0");
      await stakingPool.connect(user1).submit({ value: deposit });

      const balanceBefore = await stakingPool.balanceOf(user1.address);
      expect(balanceBefore).to.equal(deposit);

      // Process reward
      const reward = ethers.parseEther("1.0");
      const newPooled = deposit + reward;
      await stakingPool.connect(oracle).processOracleReport(newPooled, 0, 0);

      const balanceAfter = await stakingPool.balanceOf(user1.address);
      const expectedBalance = deposit + reward - (reward * BigInt(INITIAL_TREASURY_FEE) / 10000n);
      expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
    });
  });
});
