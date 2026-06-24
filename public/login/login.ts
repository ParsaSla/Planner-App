const feedback = document.getElementById("feedback") as HTMLElement | null;
const toggleBtn = document.getElementById("toggleBtn") as HTMLElement | null;
const submitBtn = document.getElementById("submitBtn") as HTMLInputElement | null;
const confirimPasswordLabel = document.getElementById("confirmPasswordLabel") as HTMLElement | null;
const confirmPasswordField = document.getElementById("confirmPassword") as HTMLInputElement | null;
const authForm = document.getElementById("authForm") as HTMLFormElement | null;
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup") as HTMLElement | null;
const headerTitle = document.getElementById("headerTitle") as HTMLElement | null;
const headerSubtitle = document.getElementById("headerSubtitle") as HTMLElement | null;
const passwordField = document.getElementById("password") as HTMLInputElement | null;
const passwordGuide = document.getElementById("passwordGuide") as HTMLElement | null;

if (!feedback || !toggleBtn || !submitBtn || !confirimPasswordLabel || !confirmPasswordField || !authForm || !confirmPasswordGroup || !headerTitle || !headerSubtitle || !passwordField || !passwordGuide) {
    throw new Error("Missing required login form elements");
}

const passwordRules: { rule: string; test: (pw: string) => boolean }[] = [
    { rule: "length", test: (pw) => pw.length >= 8 },
    { rule: "upper", test: (pw) => /[A-Z]/.test(pw) },
    { rule: "lower", test: (pw) => /[a-z]/.test(pw) },
    { rule: "number", test: (pw) => /[0-9]/.test(pw) },
];

function passwordMeetsRules(pw: string): boolean {
    return passwordRules.every(({ test }) => test(pw));
}

function updatePasswordGuide() {
    const pw = passwordField!.value;
    for (const { rule, test } of passwordRules) {
        const item = passwordGuide!.querySelector(`li[data-rule="${rule}"]`);
        if (!item) continue;
        const ok = test(pw);
        item.classList.toggle("valid", ok);
        const check = item.querySelector(".check");
        if (check) check.textContent = ok ? "✓" : "○";
    }
}

passwordField.addEventListener("input", updatePasswordGuide);

feedback.textContent = "";
feedback.classList.remove("show");

let isRegistering = false;

toggleBtn.addEventListener("click", () => {
    isRegistering = !isRegistering;
    
    if (isRegistering) {
        submitBtn.value = "Register";
        toggleBtn.textContent = "Already have an account? Login";
        headerTitle.textContent = "Create your account";
        headerSubtitle.textContent = "Set up your planner to start organizing your tasks.";
        confirmPasswordGroup.classList.add("show");
        confirmPasswordField.required = true;
        passwordGuide.classList.add("show");
        updatePasswordGuide();
    } else {
        submitBtn.value = "Login";
        toggleBtn.textContent = "No account? Register";
        headerTitle.textContent = "Welcome back";
        headerSubtitle.textContent = "Sign in to organize your tasks and manage your time.";
        confirmPasswordGroup.classList.remove("show");
        confirmPasswordField.required = false;
        passwordGuide.classList.remove("show");
    }
});

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(authForm);

    const data = Object.fromEntries(formData.entries());
    
    // Remove confirmPassword from data if not registering
    if (!isRegistering) {
        delete data.confirmPassword;
    } else {
        if (!passwordMeetsRules(String(data.password ?? ""))) {
            feedback.classList.add("show", "error");
            feedback.classList.remove("success");
            feedback.textContent = "Password does not meet the requirements below.";
            return;
        }
        if (data.password !== data.confirmPassword) {
            feedback.classList.add("show", "error");
            feedback.classList.remove("success");
            feedback.textContent = "Passwords do not match.";
            return;
        }
    }

    const response = await fetch(isRegistering ? "/register" : "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (result.success) {
        feedback.classList.add("show", "success");
        feedback.classList.remove("error");
        feedback.textContent = isRegistering ? "Account created! Redirecting to login..." : "Login successful! Redirecting...";
        // Redirect to the location specified by the server
        if (result.redirect) {
            setTimeout(() => {
                window.location.href = result.redirect;
            }, 1000);
        }
    } else {
        feedback.classList.add("show", "error");
        feedback.classList.remove("success");
        feedback.textContent = result.error || (isRegistering ? "Could not create account." : "Invalid username or password");
    }
  });