import { describe, expect, it } from "vitest";
import { describeReasonAsSeen } from "./failure";

describe("describeReasonAsSeen", () => {
  it("tells onlookers the actor was already next to the person they walked to", () => {
    expect(describeReasonAsSeen("I was already right next to them")).toBe(
      "they were already right next to them",
    );
  });

  it("turns every first-person word into third person", () => {
    expect(describeReasonAsSeen("I don't have enough bread: I need 2 and have 1")).toBe(
      "they don't have enough bread: they need 2 and have 1",
    );
    expect(describeReasonAsSeen("I can't hand something to myself")).toBe(
      "they can't hand something to themselves",
    );
    expect(describeReasonAsSeen("I'm too tired for my work")).toBe(
      "they're too tired for their work",
    );
  });

  it("leaves names and other people's words alone", () => {
    expect(describeReasonAsSeen("Ilsa is too far away to hand anything to")).toBe(
      "Ilsa is too far away to hand anything to",
    );
  });
});
