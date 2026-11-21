import assert from "node:assert/strict";
import test from "node:test";
import { answerTextFromCompletion, chatRequestBody, groqChat, visibleAnswer } from "../shared/groq.js";

test("a normal content string is the answer", () => {
  const text = answerTextFromCompletion({
    choices: [{ finish_reason: "stop", message: { content: "  I launched 4 campaigns.  " } }]
  });
  assert.equal(text, "I launched 4 campaigns.");
});

test("content parts are joined and reasoning is not used as the answer", () => {
  const text = answerTextFromCompletion({
    choices: [{
      finish_reason: "stop",
      message: {
        content: [{ type: "reasoning", text: "thinking" }, { type: "text", text: "I reached 760 leads." }],
        reasoning: "This should not be the answer."
      }
    }]
  });
  assert.equal(text, "I reached 760 leads.");
});

test("empty content is an error even when reasoning is present", () => {
  assert.throws(
    () => answerTextFromCompletion({
      choices: [{
        finish_reason: "length",
        message: { content: "", reasoning: "The model thought for a long time and never wrote the reply." }
      }]
    }),
    /token limit|empty answer/
  );
  assert.throws(
    () => answerTextFromCompletion({
      choices: [{ finish_reason: "stop", message: { content: "   ", reasoning: "unused" } }]
    }),
    /empty answer/
  );
});

test("think tags are removed from the visible answer", () => {
  assert.equal(visibleAnswer("<think>plan the story</think>\nI maintained a reply-tracking sheet."), "I maintained a reply-tracking sheet.");
});

test("GPT-OSS requests keep reasoning short and leave room for the answer", () => {
  const body = chatRequestBody({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: "Write the answer." }],
    maxTokens: 900
  });
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.reasoning_format, "hidden");
  assert.equal(body.include_reasoning, undefined);
  assert.equal(body.max_completion_tokens, 900);
  assert.equal(body.max_tokens, 900);
});

test("a live Groq call returns answer text when a key is set", async (t) => {
  if (!process.env.GROQ_API_KEY) {
    t.skip();
    return;
  }
  const result = await groqChat({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: "Reply with exactly the word ready." }],
    maxTokens: 200
  });
  assert.match(result.text, /ready/i);
});
