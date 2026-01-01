import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { SignInResource } from "@clerk/shared/types";
import { SignedIn, SignedOut, useSignIn, useClerk } from "@clerk/clerk-react";
import { Search, Loader2 } from "lucide-react";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const clerk = useClerk();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSignInRef = useRef<SignInResource | null>(null);

  const handleAuthCallback = useCallback(
    async (callbackUrl: string) => {
      console.log("Processing auth callback:", callbackUrl);
      setIsSigningIn(true);
      setError(null);

      try {
        const urlObj = new URL(callbackUrl);
        const status = urlObj.searchParams.get("__clerk_status");
        const createdSessionId = urlObj.searchParams.get(
          "__clerk_created_session_id",
        );

        if (status === "error") {
          throw new Error(
            urlObj.searchParams.get("__clerk_error_message") ||
              "Authentication failed",
          );
        }

        console.log(
          "Callback params - status:",
          status,
          "sessionId:",
          createdSessionId,
        );

        if (createdSessionId) {
          console.log("Activating session from callback params");
          await clerk.setActive({ session: createdSessionId });
          pendingSignInRef.current = null;
          return;
        }

        const pendingSignIn = pendingSignInRef.current || signIn;
        if (pendingSignIn) {
          console.log("Reloading signIn to check status...");
          await pendingSignIn.reload();
          console.log("SignIn status:", pendingSignIn.status);

          if (
            pendingSignIn.status === "complete" &&
            pendingSignIn.createdSessionId
          ) {
            console.log("Activating session from reloaded signIn");
            await clerk.setActive({ session: pendingSignIn.createdSessionId });
            pendingSignInRef.current = null;
            return;
          }
        }

        console.log("Attempting handleRedirectCallback as fallback...");
        window.history.replaceState({}, "", urlObj.pathname + urlObj.search);
        await clerk.handleRedirectCallback({
          signInForceRedirectUrl: "/",
          signUpForceRedirectUrl: "/",
        });

        pendingSignInRef.current = null;
        console.log("Authentication completed");
      } catch (err) {
        console.error("Auth callback error:", err);
        setError(err instanceof Error ? err.message : "Authentication failed");
        pendingSignInRef.current = null;
      } finally {
        setIsSigningIn(false);
      }
    },
    [clerk, signIn],
  );

  useEffect(() => {
    if (!window.electronAPI?.onAuthCallback) return;

    const unsubscribe = window.electronAPI.onAuthCallback(handleAuthCallback);
    return unsubscribe;
  }, [handleAuthCallback]);

  const signInWithGoogle = async () => {
    if (!signIn || !signInLoaded) return;

    setIsSigningIn(true);
    setError(null);

    try {
      const result = await signIn.create({
        strategy: "oauth_google",
        redirectUrl: "http://localhost:3001/auth/callback",
        actionCompleteRedirectUrl: "http://localhost:3001/auth/callback",
      });

      pendingSignInRef.current = result;

      const externalVerificationUrl =
        result.firstFactorVerification?.externalVerificationRedirectURL;

      if (externalVerificationUrl) {
        const urlString =
          typeof externalVerificationUrl === "string"
            ? externalVerificationUrl
            : externalVerificationUrl.toString();

        console.log("Opening OAuth URL:", urlString);

        if (window.electronAPI?.openExternal) {
          await window.electronAPI.openExternal(urlString);
        } else {
          window.location.href = urlString;
        }
      } else {
        throw new Error("Failed to get OAuth URL");
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError(err instanceof Error ? err.message : "Failed to start sign in");
      setIsSigningIn(false);
      pendingSignInRef.current = null;
    }
  };

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

              <div className="border border-gray-200 rounded-xl p-6">
                <button
                  onClick={signInWithGoogle}
                  disabled={isSigningIn || !signInLoaded}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span className="text-gray-700 font-medium">
                    {isSigningIn ? "Signing in..." : "Continue with Google"}
                  </span>
                </button>

                {error && (
                  <p className="mt-4 text-sm text-red-600 text-center">
                    {error}
                  </p>
                )}

                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 text-center">
                    Secured by Clerk
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}
