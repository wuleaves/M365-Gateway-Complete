import { afterEach, describe, expect, it } from "vitest";
import { applyRuntimeModelConfiguration, canonicalModel, modelCatalog, modelTone } from "../src/models";

afterEach(() => applyRuntimeModelConfiguration({ aliases: {}, models: [] }));

describe("extended Go-compatible model catalog", () => {
  it("accepts the additional GPT-5 routes", () => {
    for (const model of ["gpt-5.2", "gpt-5.2-reasoning", "gpt-5.3", "gpt-5.4", "gpt-5.4-reasoning", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(canonicalModel(model)).toBe(model);
    }
  });

  it("routes standard and reasoning requests to the matching ChatHub tones", () => {
    expect(modelTone("gpt-5.2", "low")).toBe("Gpt_5_2_Chat");
    expect(modelTone("gpt-5.2", "high")).toBe("Gpt_5_2_Reasoning");
    expect(modelTone("gpt-5.4-reasoning")).toBe("Gpt_5_4_Reasoning");
  });

  it("marks newly imported models tenant-dependent rather than pretending they are verified", () => {
    const ids = new Map(modelCatalog().map((model) => [String(model.id), model]));
    expect(ids.get("gpt-5.4")).toMatchObject({ x_m365_availability: "tenant_dependent" });
    expect(ids.get("gpt-5.6-terra")).toMatchObject({ x_m365_availability: "tenant_dependent" });
  });

  it("supports bounded administrator model aliases and ChatHub tones", () => {
    applyRuntimeModelConfiguration({
      aliases: { "company-default": "company-copilot" },
      models: [{ id: "company-copilot", tone: "Gpt_6_Company", reasoningTone: "Gpt_6_Company_Reasoning" }],
    });
    expect(canonicalModel("company-default")).toBe("company-copilot");
    expect(modelTone("company-copilot", "low")).toBe("Gpt_6_Company");
    expect(modelTone("company-copilot", "high")).toBe("Gpt_6_Company_Reasoning");
    expect(modelCatalog().find((model) => model.id === "company-copilot")).toMatchObject({
      x_m365_availability: "tenant_dependent",
    });
  });
});
