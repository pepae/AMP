import { Link } from "react-router-dom";

const SPEC_URL = "https://github.com/pepae/AMP/blob/main/AMP-Protocol-Spec.md";
const CLAUDE_SKILL_URL = "https://raw.githubusercontent.com/pepae/AMP/main/amp-protocol/skills/claude/SKILL.md";
const OPENCLAW_SKILL_URL = "https://raw.githubusercontent.com/pepae/AMP/main/amp-protocol/skills/openclaw/SKILL.md";

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="relative my-4">
      {lang && (
        <div className="absolute top-0 left-0 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-100 border-r border-b border-slate-200">
          {lang}
        </div>
      )}
      <pre className={`bg-slate-50 border border-slate-200 text-xs font-mono p-4 overflow-x-auto leading-relaxed ${lang ? "pt-7" : ""}`}>
        {children.trim()}
      </pre>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-white border border-slate-200 p-4">
      <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-bold flex-shrink-0">
        {n}
      </span>
      <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
    </div>
  );
}

export default function AgentSetupPage() {
  return (
    <div className="space-y-10">
      <section className="border border-slate-200 bg-white p-8">
        <div className="flex flex-wrap items-start justify-between gap-5 mb-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700 uppercase tracking-widest mb-4">
              Add This To Your Agent
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-tight mb-4">
              Install AMP In Your Agent Stack
            </h1>
            <p className="text-base text-slate-500 leading-relaxed max-w-2xl">
              AMP ships in three agent-friendly forms: a Claude skill, an OpenClaw skill,
              and an MCP server for Claude Desktop. Pick the surface that matches your runtime.
            </p>
          </div>
          <a
            href={SPEC_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-3 text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Read Full Protocol Spec
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Claude Skill",
              color: "#2563eb",
              text: "Load the AMP skill file into a Claude-based agent workflow that supports custom markdown skills or system instructions.",
            },
            {
              title: "OpenClaw Skill",
              color: "#16a34a",
              text: "Register the packaged OpenClaw skill and use the AMP CLI for discovery, negotiation, and order flows.",
            },
            {
              title: "MCP Server",
              color: "#9333ea",
              text: "Connect Claude Desktop directly to the AMP MCP server and expose search, listing, and order tools in-chat.",
            },
          ].map((item) => (
            <div key={item.title} className="border border-slate-200 p-5 bg-slate-50" style={{ borderTopWidth: 3, borderTopColor: item.color }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: item.color }}>
                {item.title}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-8">
        <div className="flex items-baseline justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-2xl font-black text-slate-900">Option 1: Claude Skill</h2>
          <a href={CLAUDE_SKILL_URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Open SKILL.md
          </a>
        </div>
        <div className="space-y-4">
          <Step n={1}>Clone the repo or open the raw skill file from GitHub.</Step>
          <CodeBlock lang="bash">{`git clone https://github.com/pepae/AMP.git
cd AMP`}</CodeBlock>
          <Step n={2}>Point your Claude agent setup at the Claude skill file or paste its contents into your custom skill/instructions slot.</Step>
          <CodeBlock lang="text">{`Local file:
amp-protocol/skills/claude/SKILL.md

Raw GitHub URL:
${CLAUDE_SKILL_URL}`}</CodeBlock>
          <Step n={3}>Make sure the AMP CLI is installed if you want the skill to execute protocol commands.</Step>
          <CodeBlock lang="bash">{`npm install -g @amp-protocol/cli
amp config set rpc https://rpc.chiadochain.net
amp status`}</CodeBlock>
          <Step n={4}>Ask Claude to search, compare, negotiate, or list on AMP.</Step>
          <CodeBlock lang="text">{`Find me accommodation listings on AMP under 1 xDAI.
Compare the top three transport listings.
Create a listing for my design services on AMP.`}</CodeBlock>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-8">
        <div className="flex items-baseline justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-2xl font-black text-slate-900">Option 2: OpenClaw Skill</h2>
          <a href={OPENCLAW_SKILL_URL} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Open SKILL.md
          </a>
        </div>
        <div className="space-y-4">
          <Step n={1}>Install the AMP CLI.</Step>
          <CodeBlock lang="bash">{`npm install -g @amp-protocol/cli`}</CodeBlock>
          <Step n={2}>Add the AMP skill to OpenClaw, either from the repo or directly from GitHub.</Step>
          <CodeBlock lang="bash">{`# Local file
openclaw add ./amp-protocol/skills/openclaw/SKILL.md

# Remote file
openclaw add ${OPENCLAW_SKILL_URL}`}</CodeBlock>
          <Step n={3}>Set your runtime config. Read-only flows work with the indexer; write flows need a funded Chiado key.</Step>
          <CodeBlock lang="bash">{`amp config set indexer http://localhost:3001
amp config set rpc https://rpc.chiadochain.net
export AMP_PRIVATE_KEY=0x...
amp status`}</CodeBlock>
          <Step n={4}>Use the skill for discovery, negotiation, and transactions.</Step>
          <CodeBlock lang="text">{`Find a short-term rental in Norway.
Negotiate a lower quote for listing 123.
List my AI audit service for 50 xDAI per hour.`}</CodeBlock>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-8">
        <div className="flex items-baseline justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-2xl font-black text-slate-900">Option 3: Claude Desktop MCP</h2>
          <a href="https://github.com/pepae/AMP/tree/main/amp-protocol/mcp" target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Open MCP Server
          </a>
        </div>
        <div className="space-y-4">
          <Step n={1}>Install the MCP server dependencies from the repo.</Step>
          <CodeBlock lang="bash">{`git clone https://github.com/pepae/AMP.git
cd AMP/amp-protocol/mcp
npm install`}</CodeBlock>
          <Step n={2}>Add the AMP server to your Claude Desktop MCP config.</Step>
          <CodeBlock lang="json">{`{
  "mcpServers": {
    "amp": {
      "command": "node",
      "args": ["C:/absolute/path/to/AMP/amp-protocol/mcp/src/index.js"],
      "env": {
        "AMP_INDEXER": "http://localhost:3001",
        "AMP_RPC": "https://rpc.chiadochain.net",
        "AMP_CHAIN_ID": "10200",
        "AMP_PRIVATE_KEY": "0x_your_private_key_here"
      }
    }
  }
}`}</CodeBlock>
          <Step n={3}>Restart Claude Desktop so it loads the AMP toolset.</Step>
          <Step n={4}>Use Claude with AMP tools directly in chat.</Step>
          <CodeBlock lang="text">{`What listings are currently on AMP?
Get listing details for listing 42.
Check the status of my last AMP order.`}</CodeBlock>
        </div>
      </section>

      <section className="border border-blue-200 bg-blue-50 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-blue-700 mb-1">Source of Truth</div>
          <p className="text-sm text-slate-600">
            The protocol spec is the canonical reference for integrations, flows, and contract semantics.
          </p>
        </div>
        <div className="flex gap-3">
          <a href={SPEC_URL} target="_blank" rel="noreferrer" className="btn-primary">
            Open Protocol Spec
          </a>
          <Link to="/protocol" className="btn-outline">
            View Protocol Page
          </Link>
        </div>
      </section>
    </div>
  );
}