import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";

export default async function Home() {
  const { user } = await validateRequest();
  redirect(user ? "/dashboard" : "/login");
}
