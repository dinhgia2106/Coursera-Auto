document.addEventListener("DOMContentLoaded", function () {
  // Elements
  const apiKeyInput = document.getElementById("api-key");
  const toggleVisibilityBtn = document.getElementById("toggle-visibility");
  const saveApiKeyBtn = document.getElementById("save-api-key");
  const autoLearnBtn = document.getElementById("auto-learn");
  const autoQuizBtn = document.getElementById("auto-quiz");
  const statusDiv = document.getElementById("status");

  // Load saved API key
  chrome.storage.sync.get(["geminiApiKey"], function (result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      showStatus("API Key đã được nạp", "success");
    }
  });

  // Toggle password visibility
  toggleVisibilityBtn.addEventListener("click", function () {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleVisibilityBtn.querySelector("i").className =
        "fa-regular fa-eye-slash";
    } else {
      apiKeyInput.type = "password";
      toggleVisibilityBtn.querySelector("i").className = "fa-regular fa-eye";
    }
  });

  // Save API key
  saveApiKeyBtn.addEventListener("click", function () {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus("API Key không được để trống", "error");
      return;
    }

    chrome.storage.sync.set({ geminiApiKey: apiKey }, function () {
      showStatus("API Key đã được lưu", "success");
    });
  });

  // Auto Learn button
  autoLearnBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0].url.includes("coursera.org")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "autoLearn" });
        showStatus("Đang thực hiện Auto Learn...", "success");
      } else {
        showStatus(
          "Vui lòng mở trang Coursera để sử dụng tính năng này",
          "error"
        );
      }
    });
  });

  // Auto Quiz button
  autoQuizBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0].url.includes("coursera.org")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "autoQuiz" });
        showStatus("Đang thực hiện Auto Quiz...", "success");
      } else {
        showStatus(
          "Vui lòng mở trang Coursera để sử dụng tính năng này",
          "error"
        );
      }
    });
  });

  // Show status message
  function showStatus(message, type = "") {
    statusDiv.textContent = message;
    statusDiv.className = "status show";

    if (type) {
      statusDiv.classList.add(type);
    }

    setTimeout(() => {
      statusDiv.classList.remove("show");
      if (type) {
        statusDiv.classList.remove(type);
      }
    }, 3000);
  }
});
