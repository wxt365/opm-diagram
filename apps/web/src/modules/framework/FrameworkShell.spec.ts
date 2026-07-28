import { mount } from "@vue/test-utils";
import { expect, it } from "vitest";

import FrameworkShell from "./FrameworkShell.vue";

it("renders the framework shell", () => {
  expect(mount(FrameworkShell).get('[data-testid="framework-shell"]')).toBeTruthy();
});
