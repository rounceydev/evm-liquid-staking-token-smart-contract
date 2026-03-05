const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("WstETH", function () {
  let stakingPool, wstETH;
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

    // Set wstETH in staking pool (for reference)
    await stakingPool.grantRole(await stakingPool.ORACLE_ROLE(), oracle.address);
  });

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await wstETH.name()).to.equal("Wrapped Liquid Staking Token");
      expect(await wstETH.symbol()).to.equal("wstETH");
      expect(await wstETH.stETH()).to.equal(await stakingPool.getAddress());
    });
  });

  describe("Wrapping", function () {
    beforeEach(async function () {
      // User deposits ETH to get stETH
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
    });

    it("Should wrap stETH to wstETH", async function () {
      const stETHAmount = ethers.parseEther("5.0");
      
      // Approve wstETH to spend stETH
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);

      await expect(wstETH.connect(user1).wrap(stETHAmount))
        .to.emit(wstETH, "Wrapped")
        .withArgs(user1.address, stETHAmount, stETHAmount);

      expect(await wstETH.balanceOf(user1.address)).to.equal(stETHAmount);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(ethers.parseEther("5.0"));
    });

    it("Should maintain 1:1 ratio initially", async function () {
      const stETHAmount = ethers.parseEther("5.0");
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);
      await wstETH.connect(user1).wrap(stETHAmount);

      const wstETHAmount = await wstETH.balanceOf(user1.address);
      const stETHByWstETH = await wstETH.getStETHByWstETH(wstETHAmount);
      expect(stETHByWstETH).to.equal(stETHAmount);
    });
  });

  describe("Unwrapping", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const stETHAmount = ethers.parseEther("5.0");
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);
      await wstETH.connect(user1).wrap(stETHAmount);
    });

    it("Should unwrap wstETH to stETH", async function () {
      const wstETHAmount = ethers.parseEther("5.0");
      const stETHBalanceBefore = await stakingPool.balanceOf(user1.address);

      await expect(wstETH.connect(user1).unwrap(wstETHAmount))
        .to.emit(wstETH, "Unwrapped")
        .withArgs(user1.address, wstETHAmount, wstETHAmount);

      expect(await wstETH.balanceOf(user1.address)).to.equal(0);
      expect(await stakingPool.balanceOf(user1.address)).to.equal(stETHBalanceBefore + wstETHAmount);
    });
  });

  describe("Rebasing Effects", function () {
    it("Should appreciate wstETH value after rewards", async function () {
      // Setup: user deposits and wraps
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const stETHAmount = ethers.parseEther("10.0");
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);
      await wstETH.connect(user1).wrap(stETHAmount);

      const wstETHAmount = await wstETH.balanceOf(user1.address);
      const stETHValueBefore = await wstETH.getStETHByWstETH(wstETHAmount);

      // Process reward
      const reward = ethers.parseEther("1.0");
      const newPooled = ethers.parseEther("11.0");
      await stakingPool.connect(oracle).processOracleReport(newPooled, 0, 0);

      // wstETH balance stays the same
      expect(await wstETH.balanceOf(user1.address)).to.equal(wstETHAmount);

      // But stETH value increases
      const stETHValueAfter = await wstETH.getStETHByWstETH(wstETHAmount);
      expect(stETHValueAfter).to.be.gt(stETHValueBefore);
    });
  });

  describe("Conversion Functions", function () {
    beforeEach(async function () {
      await stakingPool.connect(user1).submit({ value: ethers.parseEther("10.0") });
      const stETHAmount = ethers.parseEther("5.0");
      await stakingPool.connect(user1).approve(await wstETH.getAddress(), stETHAmount);
      await wstETH.connect(user1).wrap(stETHAmount);
    });

    it("Should calculate stETH by wstETH correctly", async function () {
      const wstETHAmount = ethers.parseEther("5.0");
      const stETHAmount = await wstETH.getStETHByWstETH(wstETHAmount);
      expect(stETHAmount).to.equal(ethers.parseEther("5.0"));
    });

    it("Should calculate wstETH by stETH correctly", async function () {
      const stETHAmount = ethers.parseEther("5.0");
      const wstETHAmount = await wstETH.getWstETHByStETH(stETHAmount);
      expect(wstETHAmount).to.equal(ethers.parseEther("5.0"));
    });
  });
});
