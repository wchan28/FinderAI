import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { SignInResource, SignUpResource } from "@clerk/shared/types";
import {
  SignedIn,
  SignedOut,
  useSignIn,
  useSignUp,
  useClerk,
} from "@clerk/clerk-react";
import { Search, Loader2, Mail, ArrowLeft } from "lucide-react";

type AuthGateProps = {
  children: ReactNode;
};

type AuthView = "main" | "email" | "name" | "code";
type AuthMode = "signin" | "signup";

export function AuthGate({ children }: AuthGateProps) {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const clerk = useClerk();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSignInRef = useRef<SignInResource | null>(null);
  const pendingSignUpRef = useRef<SignUpResource | null>(null);

  const [authView, setAuthView] = useState<AuthView>("main");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");

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
        redirectUrl: "http://localhost:3002/auth/callback",
        actionCompleteRedirectUrl: "http://localhost:3002/auth/callback",
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

  const checkEmail = async () => {
    if (!signIn || !signInLoaded || !email.trim()) return;

    setIsSigningIn(true);
    setError(null);

    const trimmedEmail = email.trim();

    try {
      const result = await signIn.create({
        identifier: trimmedEmail,
      });

      pendingSignInRef.current = result;

      const emailCodeFactor = result.supportedFirstFactors?.find(
        (factor) => factor.strategy === "email_code",
      );

      if (emailCodeFactor && "emailAddressId" in emailCodeFactor) {
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setAuthMode("signin");
        setAuthView("code");
      } else {
        throw new Error("Email verification not available");
      }
    } catch (err) {
      const clerkError = err as { errors?: Array<{ code: string }> };
      const isUserNotFound = clerkError.errors?.some(
        (e) =>
          e.code === "form_identifier_not_found" ||
          e.code === "identifier_not_found",
      );

      if (isUserNotFound) {
        setAuthMode("signup");
        setAuthView("name");
      } else {
        console.error("Email sign in error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to send verification code",
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const completeSignUp = async () => {
    if (!signUp || !signUpLoaded || !fullName.trim() || !email.trim()) return;

    setIsSigningIn(true);
    setError(null);

    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const signUpResult = await signUp.create({
        emailAddress: email.trim(),
        firstName,
        lastName,
      });

      pendingSignUpRef.current = signUpResult;

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });

      setAuthView("code");
    } catch (err) {
      console.error("Email sign up error:", err);
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setIsSigningIn(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) return;

    setIsSigningIn(true);
    setError(null);

    try {
      if (authMode === "signup") {
        if (!signUp) return;

        const result = await signUp.attemptEmailAddressVerification({
          code: code.trim(),
        });

        if (result.status === "complete" && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
          pendingSignUpRef.current = null;
        } else {
          throw new Error("Verification incomplete");
        }
      } else {
        if (!signIn) return;

        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        });

        if (result.status === "complete" && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
          pendingSignInRef.current = null;
        } else {
          throw new Error("Verification incomplete");
        }
      }
    } catch (err) {
      console.error("Code verification error:", err);
      setError(
        err instanceof Error ? err.message : "Invalid verification code",
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const resetAuthView = () => {
    setAuthView("main");
    setAuthMode("signin");
    setEmail("");
    setFullName("");
    setCode("");
    setError(null);
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
                  Welcome to Docora
                </h1>
                <p className="text-gray-600">
                  Sign in to search your local files using natural language.
                </p>
              </div>

              <div className="border border-gray-200 rounded-xl p-6">
                {authView === "main" && (
                  <>
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

                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-2 text-gray-500">or</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setAuthView("email")}
                      disabled={isSigningIn || !signInLoaded || !signUpLoaded}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Mail className="w-5 h-5 text-gray-500" />
                      <span className="text-gray-700 font-medium">
                        Continue with Email
                      </span>
                    </button>
                  </>
                )}

                {authView === "email" && (
                  <>
                    <button
                      onClick={resetAuthView}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>

                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && checkEmail()}
                      placeholder="Enter your email"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />

                    <button
                      onClick={checkEmail}
                      disabled={isSigningIn || !signInLoaded || !email.trim()}
                      className="w-full mt-4 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isSigningIn ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        "Continue"
                      )}
                    </button>
                  </>
                )}

                {authView === "name" && (
                  <>
                    <button
                      onClick={() => setAuthView("email")}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>

                    <p className="text-sm text-gray-600 mb-4">
                      Create your account for{" "}
                      <span className="font-medium">{email}</span>
                    </p>

                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && completeSignUp()}
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />

                    <button
                      onClick={completeSignUp}
                      disabled={
                        isSigningIn || !signUpLoaded || !fullName.trim()
                      }
                      className="w-full mt-4 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isSigningIn ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Continue"
                      )}
                    </button>
                  </>
                )}

                {authView === "code" && (
                  <>
                    <button
                      onClick={() =>
                        setAuthView(authMode === "signup" ? "name" : "email")
                      }
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>

                    <p className="text-sm text-gray-600 mb-4">
                      We sent a verification code to{" "}
                      <span className="font-medium">{email}</span>
                    </p>

                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Verification code
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                      placeholder="Enter 6-digit code"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg tracking-widest"
                      maxLength={6}
                      autoFocus
                    />

                    <button
                      onClick={verifyCode}
                      disabled={isSigningIn || code.length < 6}
                      className="w-full mt-4 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {isSigningIn ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </>
                )}

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
