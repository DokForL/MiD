import { describe, it, expect, vi } from "vitest";

// Node env, no DOM: DOMPurify only sanitizes, so a passthrough keeps the
// highlighter's output visible to the assertions.
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const { render } = await import("../../src/lib/renderer/pipeline");

// Prose in a `text` fence (an email draft) came out with its apostrophes
// coloured as string delimiters: `text` was not a registered language, so the
// block fell through to highlightAuto, which guessed a programming language.
const PROSE = "Merci pour l'envoi. Je pense qu'il s'agit du bon fichier, j'ai vérifié.";

describe("plain-text code fences", () => {
  for (const lang of ["text", "txt", "plaintext"]) {
    it(`leaves a \`${lang}\` block uncoloured`, () => {
      const html = render("```" + lang + "\n" + PROSE + "\n```");
      expect(html).toContain(`class="language-${lang}"`);
      expect(html).not.toContain("hljs-");
    });
  }

  it("still highlights a real language", () => {
    const html = render("```js\nconst a = 'x';\n```");
    expect(html).toContain("hljs-string");
  });
});

describe("code fence autodetection budget", () => {
  it("leaves long unlabelled fences escaped and preserves explicit highlighting", () => {
    const source = "const example = '<tag>'; // " + "x".repeat(4096);
    expect(render(`\`\`\`\n${source}\n\`\`\``)).toContain("&lt;tag&gt;");
    expect(render(`\`\`\`\n${source}\n\`\`\``)).not.toContain("hljs-");
    expect(render(`\`\`\`javascript\n${source}\n\`\`\``)).toContain("hljs-string");
  });

  it("bounds new guesses per document while reusing repeated fences", () => {
    const fence = (n: number) => `\`\`\`\nconst marker${n} = "sample";\n\`\`\`\n`;
    const html = render(Array.from({ length: 30 }, (_, i) => fence(i + 400)).join("\n") + "\n" + fence(400));
    expect(html).toMatch(/<pre><code>const marker429 = &quot;sample&quot;/);
    expect(html).not.toContain("<pre><code>const marker400");
  });
});
