import { StatePanel } from "@/components/site/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20">
      <StatePanel kind="notfound" title="Nothing on this lap" action={{ href: "/", label: "Back to races" }}>
        The page or race you were looking for isn’t in the bundled dataset.
      </StatePanel>
    </div>
  );
}
