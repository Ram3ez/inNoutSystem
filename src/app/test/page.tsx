import { BasePage } from "@/components/BasePage";

export default function MyPage() {
  return (
    <BasePage
      title="My Feature"
      subtitle="Brief description of the tool"
      maxWidth="xl" // sm | md | lg | xl | 7xl | full
      requireCaretaker={true}
    >
      {<h1>hello</h1>}
      <div className="bg-surface/40 backdrop-blur-xl border border-primary/5 rounded-[2.5rem] p-8">
        <h2 className="text-xl font-bold text-primary">Hello World</h2>
      </div>
    </BasePage>
  );
}
