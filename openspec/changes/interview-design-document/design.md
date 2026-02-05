## Context

This project (Elise Clone) is a working AI-powered healthcare scheduling assistant that needs a polished design document for technical interviews. The system is fully functional with:

- Voice AI integration via VAPI (phone number: +1-667-677-9143)
- Multiple EMR adapters (OpenMRS, OpenEMR) behind an abstract interface
- PostgreSQL-backed local cache with background sync
- Agent tools for patient identification, availability lookup, and booking

The document needs to communicate both the "what" (architecture) and the "why" (design decisions) to interviewers evaluating systems design skills.

## Goals / Non-Goals

**Goals:**
- Create a single, comprehensive design document suitable for interview presentation
- Include a high-level architecture diagram (ASCII or Mermaid)
- Explain key design patterns with rationale (why these choices?)
- Provide demo instructions so interviewers can call the system
- Demonstrate full-stack healthcare engineering competencies

**Non-Goals:**
- API documentation or user guides
- Deployment/operations runbooks
- Code-level documentation or implementation details
- Exhaustive coverage of every subsystem

## Decisions

### 1. Document Format: Single Markdown File
**Choice:** One comprehensive `DESIGN.md` in project root
**Alternatives:**
- Multiple documents (overview, patterns, demo) — rejected: harder to share in interviews
- PDF/Google Doc — rejected: loses version control, harder to maintain alongside code
- Embedded in README — rejected: README should stay focused on getting started

**Rationale:** A single markdown file is easily viewable on GitHub, shareable as a link, and stays in sync with the codebase.

### 2. Diagram Style: ASCII Art in Markdown
**Choice:** ASCII diagrams (like existing README) with optional Mermaid for complex flows
**Alternatives:**
- External image files — rejected: harder to maintain, breaks in some viewers
- Mermaid-only — rejected: not all renderers support it, ASCII is more universal

**Rationale:** ASCII art renders everywhere (terminal, GitHub, VS Code) and can be copy-pasted. Mermaid can supplement for sequence diagrams.

### 3. Document Structure: Problem → Pattern → Code → Demo
**Choice:** Organize by narrative arc rather than by component
**Sections:**
1. **Problem Statement** — What does healthcare scheduling actually involve?
2. **Architecture Overview** — High-level diagram, component responsibilities
3. **Key Patterns** — EMR abstraction, sync strategy, voice AI integration
4. **Development Workflow** — Claude Code iteration loop for voice UX
5. **Live Demo** — Phone number, what to try, expected behavior

**Rationale:** Interviewers care about problem-solving approach and design thinking, not just component inventory.

### 4. Code Examples: Minimal, Interface-Focused
**Choice:** Show key interfaces (MRSAdapter) and tool signatures, not implementations
**Alternatives:**
- No code — rejected: loses technical credibility
- Full implementations — rejected: too verbose, distracts from design discussion

**Rationale:** Interfaces communicate design intent clearly. Interviewers can explore implementations in the actual codebase.

### 5. Demo Section: Prominent Placement
**Choice:** Include phone number and call script prominently at the end
**Demo number:** +1-667-677-9143 (Maple Grove Medical / OpenMRS)

**Rationale:** A working demo is the strongest proof of engineering capability. Make it easy for interviewers to experience the system firsthand.

## Risks / Trade-offs

**Document staleness** → Keep document focused on stable patterns; link to code for implementation details that may change.

**Demo availability** → OpenMRS demo instance may reset; document expected behavior so interviewers know what to expect even if demo is temporarily down.

**Over-engineering appearance** → Focus on "why" for each pattern. Every abstraction exists because of a real EMR integration need, not premature generalization.

**Interview time constraints** → Include a "5-minute overview" section at the top for time-limited discussions, with deeper sections below for follow-up.
