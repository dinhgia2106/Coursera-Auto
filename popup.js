// Gửi JSON từ textarea đến content script
document.getElementById("setQuizData").addEventListener("click", () => {
  const quizDataInput = document.getElementById("quizDataInput").value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: "SET_QUIZ_DATA",
      data: quizDataInput,
    });
  });
  document.getElementById("status").textContent = "Đã gửi quiz data!";
});

// Khi nhấn nút "Start"
document.getElementById("start").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: "START_PROCESS" });
  });
  document.getElementById("status").textContent = "Đang khởi động...";
});

// Lắng nghe tin nhắn từ content.js để cập nhật hiển thị
chrome.runtime.onMessage.addListener((message) => {
  console.log("Popup received:", message);
  if (message.type === "UPDATE_STATUS") {
    document.getElementById("status").textContent = message.status;
  } else if (message.type === "UPDATE_PROGRESS") {
    const progressDiv = document.getElementById("progress");
    progressDiv.innerHTML += `<p>${message.progress}</p>`;
    progressDiv.scrollTop = progressDiv.scrollHeight; // Tự động cuộn xuống
  }
});
