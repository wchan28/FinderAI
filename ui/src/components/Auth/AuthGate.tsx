import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Search } from "lucide-react";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  return (
    <>
      <SignedOut>
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="drag-region h-10 flex-shrink-0" />
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-md w-full mx-4">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Search className="w-8 h-8 text-blue-500" />
                </div>
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Welcome to FinderAI
                </h1>
                <p className="text-gray-600">
                  Sign in to search your local files using natural language.
                </p>
              </div>
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    cardBox: "w-full",
                    card: "shadow-none border border-gray-200 rounded-xl",
                    headerTitle: "hidden",
                    headerSubtitle: "hidden",
                    socialButtonsBlockButton:
                      "border border-gray-200 hover:bg-gray-50",
                    formButtonPrimary:
                      "bg-blue-500 hover:bg-blue-600 text-sm normal-case",
                    footerActionLink: "text-blue-500 hover:text-blue-600",
                  },
                }}
              />
            </div>
          </div>
        </div>
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}
