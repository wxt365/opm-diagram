import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchMethodLinks from "./WorkbenchMethodLinks.vue";
import type { MethodSummaryResult } from "@/shared/api/generated/draftWorkspaceContract";

const data: MethodSummaryResult["data"] = { coverage: "RELATION_EVIDENCE_ONLY", contexts: ["a", "b"].map(id => ({ context_id: `context.${id}`, name: id, architecture_level: null })), processes: [], refinements: [], architecture_links: [{ link_id: "link.1", source_context_id: "context.a", target_context_id: "context.b", kind: "INPUT" }] };
const props = { data, current: "context.a", contextNames: [], editable: true, busy: false };
describe("架构关联操作", () => {
  it("禁止自连和重复，两端方向明确，新增等待查询结果", async () => {
    const wrapper = mount(WorkbenchMethodLinks, { props });
    expect(wrapper.get('[data-testid="p03-method-link-target"]').findAll("option").map(item => item.attributes("value"))).toEqual(["", "context.b"]);
    await wrapper.get("select[data-testid=p03-method-link-target]").setValue("context.b");
    expect(wrapper.get("button[data-testid=p03-method-link-add]").attributes("disabled")).toBeDefined();
    await wrapper.get("select[data-testid=p03-method-link-kind]").setValue("GENERATES"); await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("create")![0]).toEqual(["context.b", "GENERATES"]); expect(wrapper.findAll("li")).toHaveLength(1);
    expect(wrapper.text()).toContain("出站");
    await wrapper.setProps({ current: "context.b" }); expect(wrapper.text()).toContain("入站");
    await wrapper.findAll(".nav")[0]!.trigger("click"); expect(wrapper.emitted("navigate")![0]).toEqual(["context.a"]);
    await wrapper.get("button[data-testid=p03-method-link-delete]").trigger("click");
    expect(wrapper.emitted("delete")).toBeUndefined();
    await wrapper.get("button[data-testid=p03-method-link-delete-confirm]").trigger("click"); expect(wrapper.emitted("delete")![0]).toEqual(["link.1"]);
    wrapper.unmount();
  });
  it("历史只读仍可导航，加载期间禁止操作，切图取消删除确认", async () => {
    const wrapper = mount(WorkbenchMethodLinks, { props });
    await wrapper.get("button[data-testid=p03-method-link-delete]").trigger("click");
    await wrapper.setProps({ current: "context.b", editable: false });
    expect(wrapper.find("button[data-testid=p03-method-link-delete-confirm]").exists()).toBe(false);
    expect(wrapper.get("button[data-testid=p03-method-link-delete]").attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".nav")[0]!.attributes("disabled")).toBeUndefined();
    await wrapper.setProps({ busy: true }); expect(wrapper.findAll(".nav")[0]!.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});
