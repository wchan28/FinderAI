import { useUser } from "@clerk/clerk-react";

const ADMIN_EMAIL = "warrenchan28@gmail.com";

export function useIsAdmin(): boolean {
  const { user } = useUser();
  return user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;
}
