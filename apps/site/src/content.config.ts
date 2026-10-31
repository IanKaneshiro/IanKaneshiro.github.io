import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/** Content is data (SITE-006): every field a page shows is required here, so a gap fails the build. */
const text = z.string().min(1);

const profile = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/content/profile" }),
  schema: z.object({
    name: text,
    role: text,
    headline: text,
    /** The agent's answer at the end of the hero session. */
    summary: text,
    /** What the hero's workflow tool call reads. */
    workflow: text,
    email: z.email(),
    links: z.object({ github: z.url(), linkedin: z.url() }),
  }),
});

const about = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/content/about" }),
  schema: z.object({
    bio: z.array(text).min(1),
    workingOnNow: z.array(z.object({ text, state: z.enum(["done", "in-progress", "pending"]) })).min(1),
  }),
});

const stack = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/content/stack" }),
  schema: z.object({
    /** What the hero's stack tool call reads. */
    highlights: text,
    groups: z.array(z.object({ name: text, items: z.array(text).min(1) })).min(1),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "*.json", base: "src/content/projects" }),
  schema: z.object({
    order: z.number().int(),
    name: text,
    summary: text,
    highlights: z.array(text).default([]),
    stack: z.array(text).min(1),
    source: z.url(),
    demo: z.url().optional(),
  }),
});

export const collections = { profile, about, stack, projects };
