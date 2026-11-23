import { describe, expect, it } from "vitest";
import { oplChineseDisplay } from "./oplChineseDisplay";

describe("OPL 中文显示", () => {
  it("转换截图中的调用、需要、产出及结构关联", () => {
    expect(oplChineseDisplay("定位公司与船舶 invokes 获取AIS观测.")).toBe("定位公司与船舶 调用 获取AIS观测。");
    expect(oplChineseDisplay("定位 requires 查询条件.")).toBe("定位 需要 查询条件。");
    expect(oplChineseDisplay("定位 yields 目标船舶集合.")).toBe("定位 产生 目标船舶集合。");
    expect(oplChineseDisplay("船舶 relates to 船舶公司.")).toBe("船舶 关联于 船舶公司。");
  });
  it("保留英文名称、正则特殊字符和用户关系标签", () => {
    expect(oplChineseDisplay("requires Service invokes invokes(AIS).", ["requires Service", "invokes(AIS)"])).toBe("requires Service 调用 invokes(AIS)。");
    expect(oplChineseDisplay("船舶 requires 公司.", ["船舶", "公司", "requires"])).toBe("船舶 requires 公司。");
    expect(oplChineseDisplay("Service yieldsService.")).toBe("Service yieldsService。");
  });
  it("状态变化及未知内容保留", () => {
    expect(oplChineseDisplay("复核 changes 包裹 from 待检 to 合格.")).toBe("复核 改变 包裹 从 待检 到 合格。");
    expect(oplChineseDisplay("未知的原始文本")).toBe("未知的原始文本");
  });
});
