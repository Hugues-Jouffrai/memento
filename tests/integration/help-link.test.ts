import { describe, expect, it } from "vitest";
import { makeUser } from "./support";
import { byStage, cardsReply, claimsReply, db, deliver, drain, mail, setup } from "./pipeline-support";

describe("[R-ONB-06] the first (failure) receipt links to the help page", () => {
  it("the first receipt of a new user has the /help link, the second does not", async () => {
    const u = await makeUser(db, "helplink");
    const { deps, sent } = setup({
      mails: { "h-1": mail("Warhol", "Expo"), "h-2": mail("Banksy", "Rue") },
      replies: [byStage(claimsReply, cardsReply(4))],
    });
    await deliver(u, "h-1");
    await drain(deps, u.id);
    await deliver(u, "h-2");
    await drain(deps, u.id);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.text).toContain("https://app.test/help");
    expect(sent[0]!.html).toContain("https://app.test/help");
    expect(sent[1]!.text).not.toContain("/help");
    expect(sent[1]!.html).not.toContain("/help");
  });

  it("another user's first receipt is their own first", async () => {
    const a = await makeUser(db, "helpa");
    const b = await makeUser(db, "helpb");
    const { deps, sent } = setup({ mails: { "h-3": mail("Warhol", "Note A"), "h-4": mail("Banksy", "Note B") }, replies: [byStage(claimsReply, cardsReply(4))] });
    await deliver(a, "h-3");
    await drain(deps, a.id);
    await deliver(b, "h-4");
    await drain(deps, b.id);
    expect(sent.map((m) => m.text.includes("/help"))).toEqual([true, true]);
  });
});
