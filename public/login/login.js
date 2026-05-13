const feedback = document.getElementById("feedback");
feedback.textContent = "running";

document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(event.target);

    const data = Object.fromEntries(formData.entries());

    const response = await fetch("/submit", {
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

    //feedback.textContent = result.message;
  });