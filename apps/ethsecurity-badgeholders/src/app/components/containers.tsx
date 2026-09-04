/**
 * PageInset is a container that wraps the page content.
 * It is used to create a consistent layout for the page.
 */
export function PageInset({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
}
