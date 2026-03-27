"use client";

import React from "react";
import { ExternalLink, FileText, Presentation, Github, MessageCircle } from "lucide-react";

export default function OchrePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Title & Resources */}
        <div>
          <h1 className="text-4xl font-bold mb-4">Ochre</h1>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://github.com/charlielidbury/ochre"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Github className="w-4 h-4" /> GitHub
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> Thesis (PDF)
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Presentation className="w-4 h-4" /> Slides
            </a>
          </div>
        </div>

        {/* Core Concept */}
        <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
          Instead of runtime code being expressed in a different language than types, Ochre
          expresses both in the same language, where types are just a special case of programs
          where the program has &lsquo;ambiguity&rsquo;.
        </blockquote>

        <p className="text-muted-foreground">
          Mutability and dependent types are compatible, enabling high-performance system proving.
        </p>

        {/* What is Ochre? */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">What is Ochre?</h2>
          <p>
            Ochre functions as a &ldquo;systems theorem prover&rdquo; at the intersection of:
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Low-level systems programming languages (like Rust/C)</li>
            <li>Theorem provers (like Lean/Agda)</li>
          </ol>
          <p className="text-lg font-medium mt-4">
            More or less, <strong>Ochre = Rust + Dependent Types.</strong>
          </p>
          <p className="text-muted-foreground">
            Rust&rsquo;s ownership semantics and borrow checker provide systems-level capability;
            dependent types enable formal proving.
          </p>
        </section>

        {/* Why Create Ochre? */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Why Create Ochre?</h2>
          <p>
            <strong>Primary goal:</strong> Enable programmers to verify program properties without
            leaving their language.
          </p>
          <p className="font-medium mt-2">Two verification categories:</p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>
              Proving properties currently assumed by compilers (removing unsafe code requirements
              in structures like <code className="bg-muted px-1.5 py-0.5 rounded text-sm">RefCell</code> and{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm">Vec</code>)
            </li>
            <li>
              Proving properties not currently compiler-involved (financial exchange money
              conservation, compiler specification adherence)
            </li>
          </ol>
          <p className="text-muted-foreground mt-2">
            Existing verification languages prioritize pure functional paradigms, reducing
            ergonomics and runtime performance. Multi-language approaches like Low* require
            substantial programming style changes rather than enabling natural safe Rust-like code.
          </p>
        </section>

        {/* How Ochre Works */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">How Ochre Works</h2>
          <p className="text-muted-foreground">
            The formal semantics appear in the master&rsquo;s thesis. The rough technique involves
            three interconnected aspects for handling dependent types with mutability.
          </p>
        </section>

        {/* Code Examples */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">Code Examples</h2>

          {/* Basic Types */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Basic Types</h3>
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`Bool = 'true | 'false;
Letter = 'a | 'b | 'c;`}
            </pre>
            <p className="text-sm text-muted-foreground">
              Ochre interprets capitalized identifiers as types. The{" "}
              <code className="bg-muted px-1 py-0.5 rounded">&apos;</code> prefix denotes
              atoms — arbitrary values uniquely identified by following tags. When interpreted as
              types, atoms become singleton types;{" "}
              <code className="bg-muted px-1 py-0.5 rounded">|</code> unions them into
              non-singleton types.
            </p>
          </div>

          {/* Dependent Pair Type */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Dependent Pair Type</h3>
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`DPair = (tag: Bool, match tag {
  'true => Bool,
  'false => Letter,
});`}
            </pre>
            <p className="text-sm text-muted-foreground">
              The right side depends on the left side&rsquo;s value, with match expressions
              returning different types for true/false cases.
            </p>
          </div>

          {/* Mutation Example */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Mutation Example</h3>
            <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`overwrite = (p: &mut DPair) {
  *p = ('true, 'false);
}`}
            </pre>
            <p className="text-sm text-muted-foreground">
              This function accepts a mutable reference (pointer plus uniqueness proof). Though it
              changes the pointed-at type, it maintains DPair by function&rsquo;s end. The final
              type (<code className="bg-muted px-1 py-0.5 rounded">&mut (&apos;true, &apos;false)</code>)
              widens to <code className="bg-muted px-1 py-0.5 rounded">&mut DPair</code> since the
              singleton type is a DPair subtype.
            </p>
          </div>
        </section>

        {/* Current Progress */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Current Progress</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>Formally specified syntax and typing rules via master&rsquo;s project</li>
            <li>Type checker implementation for language subset completed</li>
            <li>
              <strong>Major limitations:</strong> The formal specification is currently unsound and
              requires substantial rework; no code generation implemented
            </li>
            <li>Extensive work needed before useful software verification becomes possible</li>
          </ul>
        </section>

        {/* Additional Resources */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Additional Resources</h2>
          <p className="text-muted-foreground">
            Full code examples, formal specification, and evaluation are available in the
            master&rsquo;s thesis.
          </p>
          <p className="text-muted-foreground">
            Note: An outdated explanation page exists but has become obsolete.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <MessageCircle className="w-4 h-4" />
            <span className="text-muted-foreground">
              WhatsApp group available for questions, assistance, or receiving updates.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
