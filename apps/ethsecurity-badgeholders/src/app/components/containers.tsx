/**
 * PageInset is a container that wraps the page content.
 * It is used to create a consistent layout for the page.
 */
export function PageInset({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-6">{children}</div>
}
