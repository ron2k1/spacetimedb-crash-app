# Using Crash

Crash is a guided desktop app for working with AI. Instead of a blank chat box, it gives you a
3D workspace where you point an AI agent at a real task, watch it plan and work step by step, and
save the result as a reusable skill you can run again later.

This guide walks through everything from a standing start. No prior AI or command-line experience
is assumed. If a step needs a terminal, the exact command is written out for you.

---

## What you need first

Crash does not include its own AI. It drives an AI coding assistant you already have installed and
signed in -- either of these works:

- **Claude Code** -- Anthropic's assistant. Install guide: https://docs.claude.com/claude-code
- **Codex CLI** -- OpenAI's assistant.

You only need one. If you are not sure whether you have either, that is fine -- Crash checks for
you and tells you what it finds on the sign-in screen. You can also click past the sign-in screen
and explore the app first.

---

## Installing Crash

### Option A: Download the installer (once a release is published)

1. Go to the project's **Releases** page on GitHub.
2. Download the file named `Crash_<version>_x64-setup.exe`.
3. Double-click it and follow the prompts. It installs for your user account only -- no
   administrator password needed.
4. Launch **Crash** from the Start menu.

The installed app brings its own engine, so you do not need to install Node.js or anything else.

> If there is no release on the Releases page yet, use Option B below. The first public release is
> still being prepared.

### Option B: Run from source (for now)

You need [Node.js 20+](https://nodejs.org) and [pnpm](https://pnpm.io). Then, in a terminal:

```
pnpm install
pnpm run build
pnpm run shell:dev
```

A desktop window opens. Leave the terminal running while you use the app.

---

## First launch: the tutorial

The first time Crash opens, a short walkthrough appears. It points out the three areas you will
use:

- **Skills** -- the things Crash already knows how to do.
- **Create** -- where you teach Crash a new skill by giving it a task.
- **Power-Ups** -- optional add-ons and connections.

You can skip the walkthrough at any time, and reopen it later from the top bar. Crash, your guide
in the workspace, follows along and explains what is happening as you go.

---

## Signing in to your AI provider

On the sign-in screen, Crash shows each provider it found on your computer and whether you are
already signed in.

1. Pick the provider you want to use (Claude or Codex).
2. Click **Sign in**. Crash opens a terminal window for that provider.
3. Finish signing in **inside that terminal** -- type or paste anything it asks for there.
   Crash never sees your password or token; it only checks whether the provider reports you as
   signed in.
4. Return to Crash. It refreshes on its own and shows you as signed in.

Not ready to sign in? Click **Continue** to go straight to the workspace. You can sign in later.

---

## Asking Crash to do something

1. Type a request into the prompt bar at the bottom -- for example, "summarize the files in this
   folder" or "build me a small script that renames photos by date."
2. Press Enter. Crash shows you a short plan first and waits for you to confirm before it touches
   anything.
3. Click **Go ahead** to let it work, or cancel if the plan is not what you wanted.

The confirmation step is deliberate: nothing happens on your computer until you say yes.

---

## Watching it work

Once you confirm, the Activity area shows each step as it happens -- reading files, searching,
writing an answer -- with the timing of real work, not a fake instant result. Crash narrates the
steps in a speech bubble so you can follow what the agent is doing and why.

---

## Saving a skill

When Crash finishes something useful, you can save it as a skill. Saved skills appear on the
**Skills** shelf, marked as yours, and you can run them again later without re-explaining the task.

---

## Switching providers later

Use the provider switcher (top bar) to change between Claude and Codex. A change takes effect the
next time you start Crash, so close and reopen the app after switching.

---

## If something goes wrong

- **The window is blank or the 3D scene does not appear.** Close and reopen Crash. If you are
  running from source, make sure the `pnpm ... shell:dev` terminal is still running.
- **Crash says it cannot reach the engine.** The engine is the background program that does the
  work. If you installed Crash, reopen it. If you are running from source, re-run the
  `pnpm -r build` step, then start the app again.
- **A provider shows as not installed.** Install Claude Code or Codex CLI (links at the top of
  this guide), then reopen Crash so it can detect it.
- **You changed providers but nothing changed.** Provider changes apply on the next launch --
  fully close Crash and open it again.

---

## Your privacy

Crash talks to its engine only on your own machine (a local connection that never leaves your
computer). It never reads your saved passwords or login tokens -- when it checks whether you are
signed in, it only looks at whether the provider itself reports success. Sign-in always happens in
the provider's own terminal window, not inside Crash.
