"use client";

import React, { useState } from "react";
import {
  ExternalLink,
  FileText,
  Presentation,
  Github,
  MessageCircle,
  ChevronRight,
  Lightbulb,
  Info,
  Quote,
  Bot,
  X,
} from "lucide-react";
import { ChatView } from "@/components/chat-view";

function Collapsible({
  title,
  children,
  level = "h2",
}: {
  title: string;
  children: React.ReactNode;
  level?: "h2" | "span";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {level === "h2" ? (
          <span className="font-semibold">{title}</span>
        ) : (
          <span className="text-sm">{title}</span>
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Callout({
  icon,
  children,
}: {
  icon: "lightbulb" | "info" | "quote";
  children: React.ReactNode;
}) {
  const Icon = icon === "lightbulb" ? Lightbulb : icon === "info" ? Info : Quote;
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-muted/50 border border-border">
      <Icon className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" />
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function CodeBlock({ children, note }: { children: string; note?: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <pre className="bg-muted p-4 overflow-x-auto text-sm font-mono">{children}</pre>
      {note && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
          {note}
        </div>
      )}
    </div>
  );
}

const C = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{children}</code>
);

const OCHRE_REPO_PATH = "/Users/charlielidbury/repos/ochre";

export default function OchrePage() {
  const [chatOpen, setChatOpen] = useState(false);

  if (chatOpen) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-background/80 backdrop-blur-sm">
          <Bot className="size-4 text-amber-500" />
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Ochre Agent
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {OCHRE_REPO_PATH}
          </span>
          <button
            onClick={() => setChatOpen(false)}
            className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="size-3" />
            Back to docs
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ChatView cwd={OCHRE_REPO_PATH} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Title & Resources */}
        <div>
          <h1 className="text-4xl font-bold mb-4">Ochre</h1>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://assets.super.so/f890b173-9aa0-4184-8dbd-d0ee94de3ebb/files/00463014-8f18-41dc-81f5-2dccbb91ceae/Ochre_Thesis_Main.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> Thesis
              <span className="text-xs text-muted-foreground">887.2KB</span>
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
            <a
              href="https://www.icloud.com/keynote/0df6HzFBqkf_lqjBdYGgbpjyw#Ochre"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Presentation className="w-4 h-4" /> Slides
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
            <a
              href="https://github.com/charlielidbury/ochre"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              <Github className="w-4 h-4" /> GitHub
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
            <button
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors text-sm font-medium text-amber-700 dark:text-amber-400"
            >
              <Bot className="w-4 h-4" /> Talk to Agent
            </button>
          </div>
        </div>

        {/* Intro */}
        <p>
          Ochre is a (work in progress) language which aims to use a new architecture:
        </p>

        <Callout icon="lightbulb">
          <p>
            Instead of runtime code being expressed in a different language than types, Ochre
            expresses both in the same language, where types are just a special case of programs
            where the program has &ldquo;ambiguity&rdquo;.
          </p>
        </Callout>

        <p>
          In this paradigm, mutability and dependent types are compatible, allowing for a high
          performance system prover.
        </p>

        {/* What? */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">What?</h2>
          <p>
            Ochre will be a <em>systems theorem prover</em>, which is the intersection between:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>low-level, systems programming languages like Rust or C and</li>
            <li>theorem provers like Lean or Agda.</li>
          </ul>
          <p>
            The former will be achieved by using Rust&rsquo;s ownership semantics and borrow
            checker. The latter will be achieved via the inclusion of dependent types and{" "}
            <a href="https://www.doc.ic.ac.uk/~svb/" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">hopefully</a>{" "}
            <a href="https://zenzike.com/" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">some</a>{" "}
            <a href="https://david-davies.github.io/" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">rigor</a>.
          </p>

          <Callout icon="info">
            <p>
              More or less, <strong>Ochre = Rust + Dependent Types.</strong>
            </p>
          </Callout>
        </section>

        {/* Why? */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Why?</h2>
          <p>
            These features would allow programmers to verify properties about their programs
            without leaving the language they&rsquo;re writing those programs in. Hopefully this
            will make verification easier, and therefore increase how much software is formally
            verified globally.
          </p>
          <p>I see this verification dividing into two categories:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              Proving properties we currently tell the compiler to assume, like removing the need
              for unsafe code in{" "}
              <a href="https://doc.rust-lang.org/stable/std/cell/struct.RefCell.html" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">RefCell</a>{" "}
              and{" "}
              <a href="https://doc.rust-lang.org/std/vec/struct.Vec.html" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Vec</a>.
            </li>
            <li>
              Proving properties we currently don&rsquo;t get the compiler involved in, like
              proving a financial exchange never creates nor destroys money, or that a compiler
              respects its formal specification.
            </li>
          </ul>
          <p>
            There are already languages which support verification, but they are typically
            dependently typed pure functional languages which makes writing code harder both in
            terms of ergonomics, and runtime performance.
          </p>
          <p>
            There are multi-language stacks which allow verification of high performance software,
            like the Low* translation of F* to C, but they require the programmer to significantly
            change how they write their programs (in Low*&rsquo;s case, this means existing within
            the <C>Stack</C> monad), instead of writing more &ldquo;natural&rdquo; code like safe
            Rust.
          </p>
          <p>
            The goal of Ochre is to allow programmers to write in a language very similar to Rust,
            while having access to the power of a dependent type system.
          </p>
        </section>

        {/* How? */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">How?</h2>
          <p>
            The exact semantics of Ochre, and therefore the proper answer to{" "}
            <em>how Ochre works</em> are given in my masters thesis (PDF at top of this page), but
            here is the rough &ldquo;technique&rdquo; it uses to type check programs which have
            both dependent types and mutability:
          </p>

          {/* Collapsible: How I plan on doing it */}
          <Collapsible title="How I plan on doing it">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Like Rust, mutation is only allowed when the code performing the mutation has{" "}
                <em>exclusive</em> access to the data. This is done via a borrow checker and
                ownership, like it is in Rust.
              </li>
              <li>
                A combination of <em>strong mutation</em> and TypeScript-like{" "}
                <em>structural typing</em> is used to keep track of as much information statically
                as possible about every given variable. For example, the code <C>x = 5</C>{" "}
                mutates <C>x</C>, which causes its <em>type</em> to be updated to the singleton
                type of just <C>5</C>, instead of to the more generic <C>Nat</C> type of which{" "}
                <C>5</C> is a subtype.
              </li>
            </ul>

            <div className="ml-4 space-y-3">
              <Collapsible title="Strong Mutation" level="span">
                <p className="text-sm text-muted-foreground">
                  Strong mutation is mutation which not only changes the value of a variable, but
                  also its <em>type</em>.
                </p>
              </Collapsible>

              <Collapsible title="TypeScript-like Structural Typing" level="span">
                <p className="text-sm text-muted-foreground">
                  TypeScript and Ochre both support a very flexible type system which supports
                  subtyping, singleton types, and type operators like type union. This allows the
                  programmer to specify that a variable has precise value at the type level, like{" "}
                  <C>s: &quot;hello&quot;</C> or one of a set of values like{" "}
                  <C>s: &quot;hello&quot; | &quot;world&quot;</C>.
                </p>
              </Collapsible>
            </div>

            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                The model of computation for type level computations and runtime computations are
                almost exactly the same, which allows the type level to capture almost any desired
                runtime property. For example, the type of a function is itself a function (the
                function being used as a type must be an <em>approximation</em> of the function
                being typed). If this function is non-constant, it represents a dependent function
                type.
              </li>
            </ul>
          </Collapsible>

          {/* Collapsible: How I know it's possible */}
          <Collapsible title="How I know it's possible">
            <p className="text-sm">Begin proof:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 text-sm">
              <li>
                <a href="https://dl.acm.org/doi/epdf/10.1145/3547647" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Aeneas</a>{" "}
                demonstrated that Rust programs have the right &ldquo;shape&rdquo; to be reasoned
                about with dependent types
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li>
                    They did this by showing Rust could be translated to F*, a pure functional
                    dependently typed language
                  </li>
                </ul>
              </li>
              <li>
                If you could set up the following pipeline:
                <ol className="list-decimal list-inside ml-6 mt-1 space-y-1">
                  <li>annotate the source (Rust) program with dependent types and proof terms</li>
                  <li>carry those over during the translation step</li>
                  <li>Let F* do the verification of the proof</li>
                </ol>
              </li>
              <li>
                Then you would end up with a single user-facing language (Rust + the annotations
                from 2.a.) which has both high performance, and the ability to do verification.
              </li>
            </ul>
            <p className="text-sm">
              Since this single language which does both exists, Ochre is just a matter of building
              that or something better.
            </p>

            <Callout icon="lightbulb">
              <p>
                This pipeline is what I initially set out to build for my masters thesis, but in
                the process of doing that I realised that
              </p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>
                  the simplicity of the surface level language is compromised due to having to
                  translate to two very different languages
                </li>
                <li>
                  the Rust &rArr; F* translation is as hard to define as a full type checker, so
                  instead of making an intermediate artefact (F*) and putting that into F*&rsquo;s
                  type checker, you might as well just make a type system specifically for the
                  surface language
                </li>
              </ul>
              <p>
                and so decided to just build a new language from scratch (although{" "}
                <a
                  href="https://github.com/charlielidbury/ochre/blob/3e6359cba20235acac603835e8534c36c909b887/compiler/src/main.rs#L4"
                  className="underline hover:text-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  it is actually embedded within Rust as a macro
                </a>
                )
              </p>
            </Callout>
          </Collapsible>

          <p>
            To illustrate how the above three aspects work together, here is an example of
            mutation interacting with dependent pairs.
          </p>
        </section>

        {/* A Taste of Ochre */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">A Taste of Ochre</h2>

          <p>First, we define a few basic types:</p>

          <CodeBlock
            note={
              <>
                Ochre knows to interpret Bool and Letter as types because they begin with a capital
                letter.
              </>
            }
          >
            {`Bool = 'true | 'false;\nLetter = 'a | 'b | 'c;`}
          </CodeBlock>

          <div className="space-y-3">
            <Collapsible title="Equivalent Haskell" level="span">
              <CodeBlock>{`data Bool = True | False\ndata Letter = A | B | C`}</CodeBlock>
            </Collapsible>
            <Collapsible title="Equivalent TypeScript" level="span">
              <CodeBlock>{`type Bool = "true" | "false"\ntype Letter = "a" | "b" | "c"`}</CodeBlock>
            </Collapsible>
          </div>

          <p>
            <C>&apos;</C> denotes an <em>atom</em>, which is an arbitrary value, uniquely
            identified by the tag after the <C>&apos;</C>. When being interpreted as a type like
            they are in this code snippet, atoms are interpreted as the singleton type consisting
            of just that atom, then <C>|</C> union&rsquo;s those singleton types together into the
            non-singleton types <C>Bool</C> and <C>Letter</C>.
          </p>

          <p>
            Then we define a dependent pair type, where the right can be either a <C>Bool</C> or a{" "}
            <C>Letter</C>, depending on whether the left is <C>&apos;true</C> or{" "}
            <C>&apos;false</C>.
          </p>

          <CodeBlock>
            {`DPair = (tag: Bool, match tag {\n  'true => Bool,\n  'false => Letter,\n});`}
          </CodeBlock>

          <Collapsible title="Shorter version using syntactic sugar" level="span">
            <CodeBlock>{`DPair = ('true, Bool) | ('false, Letter);`}</CodeBlock>
            <p className="text-sm text-muted-foreground">
              <C>(&apos;true, Bool)</C> represents a pair where the left is always{" "}
              <C>&apos;true</C> (the singleton type of just <C>&apos;true</C>), and the right is
              always a Bool.
            </p>
            <p className="text-sm text-muted-foreground">
              When it is union&rsquo;ed with another similar pair, the result is a dependent pair,
              because type union is precise.
            </p>
          </Collapsible>

          <p>
            In the above snippet the left of the pair is a <C>Bool</C>, then the right of the pair
            is an expression which depends on the value of the left. Namely, its a match statement
            which returns a different type for the true and false case.
          </p>

          <p>Now we can define a function which mutates one of these dependent pairs:</p>

          <CodeBlock
            note={
              <>
                The function&rsquo;s return type isn&rsquo;t specified, so it defaults to{" "}
                <C>*</C>, which represents uninitialised data/top/no information.
              </>
            }
          >
            {`overwrite = (p: &mut DPair) {\n  *p = ('true, 'false);\n}`}
          </CodeBlock>

          <p>
            This defines a function <C>overwrite</C> which takes in a <em>mutable reference</em>{" "}
            (a pointer + a proof this pointer is unique) to a <C>DPair</C> as defined earlier.
          </p>
          <p>
            The body of <C>overwrite</C> may change the type being pointed at, but must leave it
            as a <C>DPair</C> by the end of the function body.
          </p>
          <p>
            At the end of the function the type of <C>p</C> is the singleton type{" "}
            <C>&mut (&apos;true, &apos;false)</C>, which can then be <em>widened</em> to{" "}
            <C>&mut DPair</C>, since <C>(&apos;true, &apos;false)</C> is a subtype of{" "}
            <C>DPair</C>.
          </p>
        </section>

        {/* Progress */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Progress</h2>
          <p>
            My progress so far has been formally specifying Ochre&rsquo;s syntax and typing rules
            as{" "}
            <a
              href="https://github.com/charlielidbury/ochre/blob/main/report/thesis/main.pdf"
              className="underline hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              my masters project
            </a>{" "}
            and implementing the type checker for part of the language. Both of these will need
            substantial work before they can be used to implement and verify useful software, most
            glaringly:{" "}
            <strong>
              Ochre, as formally specified, is unsound, will need major rework and the
              implementation doesn&rsquo;t generate any code.
            </strong>
          </p>
        </section>

        {/* Show Me More! */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Show Me More!</h2>
          <p>
            For code examples, formal specification, and some evaluation, see{" "}
            <a
              href="https://github.com/charlielidbury/ochre/blob/main/report/thesis/main.pdf"
              className="underline hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              my masters thesis
            </a>
            .
          </p>

          <Collapsible title="Old explanation">
            <p className="text-sm">
              Ochre uses a new paradigm of type system. Instead of types and terms being distinct
              concepts, there is only the concept of a program. Programs can be imprecise and
              approximate other programs. In this paradigm, mutability and dependent types are
              naturally compatible.
            </p>
            <p className="text-sm">
              A program is something which can be executed into a result. For example <C>1</C> is
              a program which evaluates into a 1, and <C>1 + 1</C> is a program which evaluates
              into a 2.
            </p>
            <p className="text-sm">
              An approximate program is a program which could execute into any one of a set of
              results. For example <C>1 | 2</C> is a program which could evaluate to either a 1 or
              a 2, and <C>1 + (2 | 3)</C> is a program which could evaluate to either a 3 or a 4.
              Approximate programs are only used to reason about what other programs will do when
              they are executed, and are never left in the compiled binary (Ochre uses a
              deterministic execution model).
            </p>
            <p className="text-sm">
              Exact programs and approximate programs come into contact with each other via the{" "}
              <C>:</C> operator, which is responsible for checking that one program is an
              approximation of another, and instructing the compiler to loose information.
            </p>
            <p className="text-sm">
              The program <C>A : B</C>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
              <li>
                is valid iff <C>B</C> is an approximation of <C>A</C>
              </li>
              <li>
                evaluates to the same thing as <C>A</C> when executed exactly,
              </li>
              <li>
                and evaluates to the same thing as <C>B</C> when executed approximately
              </li>
            </ul>
            <p className="text-sm">
              Approximate execution is what you do when you want to know something about what a
              program will do when it is executed, without executing it. You may want to do this
              because executing it is expensive, or, in the case of functions, because you
              don&rsquo;t know what your input is yet.
            </p>
            <p className="text-sm">
              If you haven&rsquo;t noticed already, there are a lot of equivalences between this
              paradigm and the regular term/type paradigm:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
              <li>terms roughly map onto exact programs,</li>
              <li>types roughly map onto approximate programs,</li>
              <li>execution roughly maps onto exact execution,</li>
              <li>and type checking roughly maps onto approximate execution</li>
            </ul>

            <h3 className="text-base font-semibold mt-4">&ldquo;Dependent Types&rdquo;</h3>
            <p className="text-sm">
              It is hard to explain how dependent types are expressed in Ochre, because Ochre
              doesn&rsquo;t really have types. TODO: make this sound more hopeful and less
              confusing
            </p>
            <p className="text-sm">
              A dependent function is a function where the return type depends on the input value.
              The equivalent object in Ochre terminology would be a function which is approximated
              by a non constant function. For example, take the two functions:{" "}
              <C>(x: Int) -&gt; x</C> and <C>(x: Int) -&gt; Int</C>. In a sense the former is
              more exact than the latter, because if you give it an exact value, it will return an
              exact value
            </p>
            <p className="text-sm">
              Ochre needs to be easy to use, so people actually use it, and formal enough that
              people trust the results of its analysis.
            </p>
            <Callout icon="quote">
              <p>
                I am using Rust as my benchmark for &ldquo;easy to use&rdquo;: if a program can be
                written in Rust, it should be about as easy to write in Ochre.
              </p>
            </Callout>
            <p className="text-sm">
              Broadly speaking, Ochre achieves its ergonomics by using ownership to make dependent
              types compatible with mutability. Other tools avoid addressing this incompatibility
              through a variety of architectures, such as:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
              <li>Expressing mutation through a pure abstractions like monads (Low*)</li>
              <li>Removing the mutation via a translation step (Aeneas)</li>
              <li>
                Reasoning about the effects of mutation totally outside of the type system
                (Separation logic based approaches?).
              </li>
            </ul>
            <p className="text-sm">
              Unlike these, Ochre tackles the co-existence of mutability and dependent types
              directly.
            </p>
          </Collapsible>

          <Callout icon="info">
            <p>
              There was a page here with lots of nice code examples and chit chat, but it has
              become hopelessly outdated.
            </p>
          </Callout>

          <p>
            <a
              href="https://chat.whatsapp.com/EA9WhEycctG6Tp15XR8AKL"
              className="inline-flex items-center gap-2 underline hover:text-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp groupchat
            </a>{" "}
            if you&rsquo;ve got questions, want to help, or just want updates as they come
          </p>
        </section>
      </div>
    </div>
  );
}
