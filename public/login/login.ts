const feedback = document.getElementById("feedback") as HTMLElement | null;
const toggleBtn = document.getElementById("toggleBtn") as HTMLElement | null;
const submitBtn = document.getElementById("submitBtn") as HTMLInputElement | null;
const confirimPasswordLabel = document.getElementById("confirmPasswordLabel") as HTMLElement | null;
const confirmPasswordField = document.getElementById("confirmPassword") as HTMLInputElement | null;
const authForm = document.getElementById("authForm") as HTMLFormElement | null;

if (!feedback || !toggleBtn || !submitBtn || !confirimPasswordLabel || !confirmPasswordField || !authForm) {
    throw new Error("Missing required login form elements");
}

feedback.textContent = "running";

let isRegistering = false;

toggleBtn.addEventListener("click", () => {
    isRegistering = !isRegistering;
    
    if (isRegistering) {
        submitBtn.value = "Register";
        toggleBtn.textContent = "Already have an account? Login";
        confirmPasswordField.style.display = "block";
        confirimPasswordLabel.style.display = "block";
        confirmPasswordField.required = true;
    } else {
        submitBtn.value = "Login";
        toggleBtn.textContent = "No account? Register";
        confirmPasswordField.style.display = "none";
        confirimPasswordLabel.style.display = "none";
        confirmPasswordField.required = false;
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
        if (data.password !== data.confirmPassword) {
            feedback.style.color = "red";
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
        feedback.style.color = "green";
    } else {
        feedback.style.color = "red";
    }

    feedback.textContent = result.success;
  });