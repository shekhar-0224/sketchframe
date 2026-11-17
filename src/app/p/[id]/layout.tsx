import { ProjectShell } from "@/components/workspace/project-shell";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectShell id={id}>{children}</ProjectShell>;
}
