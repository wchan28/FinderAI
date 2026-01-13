import { useUser } from "@clerk/clerk-react";
import { CLERK_ENABLED } from "../lib/clerk";

const ADMIN_EMAIL = "warrenchan28@gmail.com";

function useIsAdminWithClerk(): boolean {
  const { user } = useUser();
  return user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL;
}

function useIsAdminWithoutClerk(): boolean {
  return true;
}

export const useIsAdmin = CLERK_ENABLED
  ? useIsAdminWithClerk
  : useIsAdminWithoutClerk;
