const form = document.getElementById("lead-form");
const button = document.getElementById("confirm-button");
const errorBox = document.getElementById("form-error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  errorBox.hidden = true;
  errorBox.textContent = "";

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Submitting...";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      if (result.code === "SUPABASE_NOT_CONFIGURED") {
        throw new Error(
          "The production registration service is missing its Supabase secret. Please contact a Changlong representative."
        );
      }

      throw new Error(result.error || `Registration failed (${response.status}).`);
    }

    // A successful response means the lead is already saved.
    // Legacy responses remain compatible during deployment.
    const emailFlag = result.email_status === "pending"
      ? "pending"
      : result.email_sent ? "sent" : "failed";
    window.location.assign(`/thank-you.html?email=${emailFlag}`);
  } catch (error) {
    console.error(error);

    const message = error?.message || "Registration failed.";
    const isNetworkError = /failed to fetch|networkerror|load failed/i.test(message);

    showError(
      isNetworkError
        ? "The registration server could not be reached. Please try again."
        : message
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
