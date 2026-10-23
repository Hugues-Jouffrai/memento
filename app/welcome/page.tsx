import { redirect } from "next/navigation";

/** R-ONB-08: `/welcome` is the first screen. */
export default function WelcomeIndex(): never {
  redirect("/welcome/1");
}
