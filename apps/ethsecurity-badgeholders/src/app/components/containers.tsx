/**
 * PageInset is a container that wraps the page content.
 * It is used to create a consistent layout for the page.
 */
export function PageInset({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 p-6">{children}</div>
}
