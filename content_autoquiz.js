// Script tự động làm quiz trên Coursera
// File này sẽ được đổi tên thành content_autoquiz.js và chỉnh sửa nhiều

// Biến toàn cục để kiểm tra lệnh dừng
let stopAutoQuizScript = false;
let geminiApiKey_autoquiz = null;

// Hàm gửi log về background script
function sendQuizLogToBackground(message, type = "info") {
  // Thêm console.log ở đây để debug trực tiếp trên content script nếu cần
  // console.log(`[QuizContentScript-${type.toUpperCase()}]: ${message}`);
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "AUTOQUIZ_LOG",
      log: {
        message: message,
        type: type,
      },
    });
  } else {
    // Fallback nếu chrome.runtime không tồn tại (ví dụ: khi test ngoài extension)
    console.warn(
      "[QuizFallbackLog] chrome.runtime not available. Log: ",
      type,
      message
    );
  }
}

// Hàm gửi tiến trình về background
function sendQuizProgressToBackground(currentTask, status) {
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "AUTOQUIZ_PROGRESS",
      currentTask: currentTask,
      status: status,
    });
  }
}

// Hàm gửi thông báo lỗi về background
function sendQuizErrorToBackground(errorMsg) {
  sendQuizLogToBackground(`LỖI: ${errorMsg}`, "error");
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: "PROCESS_ERROR",
      stage: "autoquiz",
      error: errorMsg,
    });
  }
}

// Lắng nghe lệnh dừng từ background script
if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "STOP_SCRIPT") {
      sendQuizLogToBackground("Nhận lệnh dừng từ background.", "warning");
      stopAutoQuizScript = true;
      // Các hàm trong autoquiz cần kiểm tra biến stopAutoQuizScript thường xuyên
      sendResponse({ status: "Stopping AutoQuiz" });
    }
    return true; // Cho các listener khác nếu có
  });
}

// Hàm chính để khởi động script, nhận API key
async function startCourseraAutoQuiz(apiKey) {
  if (!apiKey) {
    sendQuizErrorToBackground("Không nhận được API Key để bắt đầu AutoQuiz.");
    if (chrome.runtime && chrome.runtime.sendMessage)
      chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
    return;
  }
  geminiApiKey_autoquiz = apiKey;
  stopAutoQuizScript = false; // Reset cờ dừng
  sendQuizLogToBackground(
    `AutoQuiz script đã khởi động với API Key. URL hiện tại: ${window.location.href}`,
    "success"
  );

  // ------ START Nội dung của improved_autoquiz.js gốc (đã bỏ IIFE) ------
  // Thông tin để ghi log
  const DEBUG = true; // Giữ lại DEBUG flag nếu cần, nhưng log chính sẽ qua sendQuizLogToBackground

  // Gemini API config (API_KEY sẽ dùng geminiApiKey_autoquiz)
  // const API_KEY = "KEY"; // Đã thay thế bằng geminiApiKey_autoquiz
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Những từ khóa để phát hiện quiz
  const QUIZ_KEYWORDS = ["quiz", "graded", "assignment"];

  // Từ khóa để bỏ qua
  const SKIP_KEYWORDS = ["peer", "peer-graded"];

  // Trạng thái
  // let moduleQueue = []; // Không dùng moduleQueue theo cách cũ, background sẽ điều phối
  // let currentModule = null;
  let processingQuiz = false;
  let moduleProcessingComplete = false; // Biến này có thể vẫn hữu ích trong logic nội bộ của quiz

  const STORAGE_KEY = "quiz_incorrect_answers";

  let allAvailableModules = []; // Sẽ không quản lý module ở đây nữa
  let currentModuleToProcess = null; // Sẽ không quản lý module ở đây nữa

  function extractModuleNumber(url) {
    const match = url.match(/\/module\/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // Log với màu nếu Debug mode bật - ĐỔI SANG sendQuizLogToBackground
  function log(message, type = "info") {
    // if (!DEBUG) return; // DEBUG có thể dùng để quyết định có gửi log chi tiết không
    // Tuy nhiên, để minh bạch, cứ gửi hết về background
    sendQuizLogToBackground(message, type);
  }

  // findAllModules sẽ không cần thiết vì background script quản lý việc chuyển module.
  // Tuy nhiên, logic tìm quiz trong module hiện tại VẪN CẦN.

  function containsKeywords(element, keywords) {
    if (!element) return false;
    const text = element.textContent.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  function shouldSkipQuiz(quizElement) {
    return containsKeywords(quizElement, SKIP_KEYWORDS);
  }

  function getPassThreshold(quizElement) {
    let threshold = 70;
    const passInfoText = quizElement.textContent;
    const passMatch = passInfoText.match(/need at least (\d+)%/);
    if (passMatch) {
      threshold = parseInt(passMatch[1]);
    }
    return threshold;
  }

  function isQuizPassed(quizElement) {
    if (quizElement.querySelector('[data-testid$="Failed"]')) {
      log("Quiz có trạng thái Failed", "warning");
      return false;
    }
    const passThreshold = getPassThreshold(quizElement);
    const gradeText = quizElement.textContent;
    const gradeMatch = gradeText.match(/Grade:\s*(\d+)%/);
    if (gradeMatch) {
      const grade = parseInt(gradeMatch[1]);
      if (grade >= passThreshold) {
        log(`Quiz đã pass với điểm: ${grade}% >= ${passThreshold}%`, "success");
        return true;
      } else {
        log(
          `Quiz không pass với điểm: ${grade}% < ${passThreshold}%`,
          "warning"
        );
        return false;
      }
    }
    if (quizElement.querySelector('img[alt="Completed"]') && !gradeMatch) {
      log(
        "Quiz đã hoàn thành nhưng không có thông tin điểm rõ ràng",
        "warning"
      );
      return false;
    }
    return false;
  }

  function isQuizAttemptable(quizElement) {
    const hasFailed =
      quizElement.querySelector('[data-testid$="Failed"]') !== null;
    if (hasFailed) {
      log("Đã tìm thấy quiz với trạng thái Failed", "warning");
      return true;
    }
    const passThreshold = getPassThreshold(quizElement);
    const gradeText = quizElement.textContent;
    const gradeMatch = gradeText.match(/Grade:\s*(\d+)%/);
    if (gradeMatch && parseInt(gradeMatch[1]) < passThreshold) {
      log(
        `Quiz có điểm ${gradeMatch[1]}% < ${passThreshold}%, có thể làm lại`,
        "warning"
      );
      return true;
    }
    const hasEmptyGrade = gradeText.includes("Grade: --");
    if (hasEmptyGrade) {
      log("Quiz chưa làm (Grade: --), có thể làm", "info");
      return true;
    }
    return false;
  }

  // Tìm các quiz có thể làm trong trang hiện tại (thay vì module)
  function findAttemptableQuizzesOnPage() {
    log("Đang tìm các quiz có thể làm trên trang hiện tại...");
    sendQuizProgressToBackground("Tìm quiz", "Đang quét trang...");
    const attemptableQuizzes = [];
    const allLinks = document.querySelectorAll("a");
    allLinks.forEach((link) => {
      if (stopAutoQuizScript) return;
      if (containsKeywords(link, QUIZ_KEYWORDS)) {
        if (shouldSkipQuiz(link)) {
          log(`Bỏ qua quiz peer-graded: ${link.textContent}`, "warning");
          return;
        }
        if (!isQuizPassed(link)) {
          if (isQuizAttemptable(link)) {
            const href = link.getAttribute("href");
            if (href) {
              attemptableQuizzes.push({
                url: href,
                title: link.textContent.trim(),
                element: link,
              });
              log(
                `Đã tìm thấy quiz có thể làm: ${link.textContent.trim()}`,
                "info"
              );
            }
          }
        }
      }
    });
    if (attemptableQuizzes.length > 0) {
      sendQuizProgressToBackground(
        "Tìm quiz",
        `Tìm thấy ${attemptableQuizzes.length} quiz.`
      );
    } else {
      sendQuizProgressToBackground(
        "Tìm quiz",
        "Không tìm thấy quiz nào cần làm trên trang."
      );
    }
    return attemptableQuizzes;
  }

  // Cải tiến hàm để tìm và click nút Resume
  function findAndClickResumeButton() {
    if (stopAutoQuizScript) return false;
    log("Đang tìm nút Resume...", "info");
    const allButtons = Array.from(document.querySelectorAll("button"));
    const exactResumeButton = allButtons.find(
      (btn) => btn.textContent.trim() === "Resume"
    );
    if (exactResumeButton) {
      log("Tìm thấy nút chính xác với text 'Resume'", "success");
      setTimeout(() => {
        if (!stopAutoQuizScript) exactResumeButton.click();
      }, 1000);
      return true;
    }
    const actionContainer = document.querySelector(
      '.css-1fay0sq, div.action, [data-testid="CoverPageAction__controls"]'
    );
    if (actionContainer) {
      const resumeButtonInContainer = actionContainer.querySelector("button");
      if (
        resumeButtonInContainer &&
        resumeButtonInContainer.textContent.toLowerCase().includes("resume")
      ) {
        log("Tìm thấy nút Resume trong container action", "success");
        setTimeout(() => {
          if (!stopAutoQuizScript) resumeButtonInContainer.click();
        }, 1000);
        return true;
      }
    }
    const resumeButtonByClass = document.querySelector(
      "button.cds-button-primary, button.cds-307"
    );
    if (
      resumeButtonByClass &&
      resumeButtonByClass.textContent.toLowerCase().includes("resume")
    ) {
      log("Tìm thấy nút Resume bằng class", "success");
      setTimeout(() => {
        if (!stopAutoQuizScript) resumeButtonByClass.click();
      }, 1000);
      return true;
    }
    const resumeButton = allButtons.find((btn) =>
      btn.textContent.toLowerCase().includes("resume")
    );
    if (resumeButton) {
      log("Tìm thấy nút có chứa text 'Resume'", "success");
      setTimeout(() => {
        if (!stopAutoQuizScript) resumeButton.click();
      }, 1000);
      return true;
    }
    log("Không tìm thấy nút Resume.", "error");
    return false;
  }

  // Cập nhật hàm openAndStartQuiz
  function openAndStartQuiz(quizInfo) {
    if (stopAutoQuizScript) return;
    log(`Đang mở quiz: ${quizInfo.title}`, "info");
    sendQuizProgressToBackground(quizInfo.title, "Đang mở...");
    processingQuiz = true;
    quizInfo.element.click();
    log("Đang đợi trang quiz load...", "info");

    let attempts = 0;
    const maxAttempts = 10; // Tăng lên 20 giây
    const intervalId = setInterval(() => {
      if (stopAutoQuizScript) {
        clearInterval(intervalId);
        processingQuiz = false;
        return;
      }
      attempts++;
      log(`Tìm nút Resume/Start lần ${attempts}...`, "info");

      const startSelectors = [
        'button[data-testid="start-button"]',
        'button[data-testid="StartButton"]',
        'button.cds-button-primary:not([disabled]):not([aria-disabled="true"]) span.cds-button-label:contains("Start")',
        'button:contains("Start")',
        'button[aria-label*="Start"]',
      ];
      for (const selector of startSelectors) {
        if (stopAutoQuizScript) break;
        let startButton = null;
        if (selector.includes(":contains")) {
          const parts = selector.split(":contains(");
          const baseSelector = parts[0];
          const textToContain = parts[1].replace(/['")]/g, "");
          document.querySelectorAll(baseSelector).forEach((btn) => {
            if (
              btn.textContent.trim().toLowerCase() ===
              textToContain.toLowerCase()
            ) {
              startButton = btn;
            }
          });
        } else {
          startButton = document.querySelector(selector);
        }
        if (
          startButton &&
          !startButton.disabled &&
          startButton.offsetParent !== null
        ) {
          log(
            `Đã tìm thấy nút Start với selector: "${selector}", đang click...`,
            "success"
          );
          startButton.click();
          clearInterval(intervalId);
          setTimeout(() => {
            if (!stopAutoQuizScript) injectAutoQuizScriptInternal();
          }, 3000); // Đổi tên hàm inject
          return;
        }
      }

      if (findAndClickResumeButton()) {
        log("Đã tìm và click nút Resume.", "success");
        clearInterval(intervalId);
        setTimeout(() => {
          if (!stopAutoQuizScript) injectAutoQuizScriptInternal();
        }, 3000);
        return;
      }

      if (attempts >= maxAttempts) {
        log("Không tìm thấy nút Start hoặc Resume sau nhiều lần thử!", "error");
        sendQuizErrorToBackground(
          "Không tìm thấy nút Start/Resume cho quiz: " + quizInfo.title
        );
        clearInterval(intervalId);
        processingQuiz = false;
        // Không tự động navigateToNextModule, background sẽ quyết định
        // Thông báo hoàn thành (dù là lỗi) để background biết
        if (chrome.runtime && chrome.runtime.sendMessage)
          chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
      }
    }, 2000);
  }

  function getIncorrectAnswers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      log(
        "Lỗi khi truy xuất câu trả lời sai từ storage:" + error.message,
        "error"
      );
      return {};
    }
  }

  function saveIncorrectAnswers(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      log("Lỗi khi lưu câu trả lời sai vào storage: " + error.message, "error");
    }
  }

  function addIncorrectAnswer(questionText, incorrectAnswerText) {
    const data = getIncorrectAnswers();
    if (!data[questionText]) {
      data[questionText] = [];
    }
    if (!data[questionText].includes(incorrectAnswerText)) {
      data[questionText].push(incorrectAnswerText);
    }
    saveIncorrectAnswers(data);
    log(
      `Đã thêm câu trả lời sai: "${questionText.substring(
        0,
        30
      )}...": "${incorrectAnswerText.substring(0, 30)}..."`,
      "warning"
    );
  }

  function isKnownIncorrectAnswer(questionText, answerText) {
    const data = getIncorrectAnswers();
    return (
      data[questionText] &&
      data[questionText].some(
        (incorrect) =>
          normalizeText(incorrect).includes(normalizeText(answerText)) ||
          normalizeText(answerText).includes(normalizeText(incorrect))
      )
    );
  }

  function normalizeText(text) {
    return text?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  }

  function levenshtein(a, b) {
    const m = a.length,
      n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const matrix = [];
    for (let i = 0; i <= n; i++) matrix[i] = [i];
    for (let j = 0; j <= m; j++) matrix[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[n][m];
  }

  function detectRequiredSelections(questionText) {
    const selectMatch = questionText.match(/select\s+(\w+)/i);
    const chooseMatch = questionText.match(/choose\s+(\w+)/i);
    if (selectMatch || chooseMatch) {
      const match = selectMatch || chooseMatch;
      const numWord = match[1].toLowerCase();
      const wordToNumber = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
      };
      if (wordToNumber[numWord]) return wordToNumber[numWord];
      else if (!isNaN(parseInt(numWord))) return parseInt(numWord);
    }
    return 1;
  }

  async function getAnswerFromGemini(
    questionText,
    optionTexts = [],
    incorrectOptions = [],
    isCheckbox = false
  ) {
    if (stopAutoQuizScript) return null;
    if (!geminiApiKey_autoquiz) {
      log(
        "API Key cho Gemini chưa được thiết lập trong autoquiz script.",
        "error"
      );
      sendQuizErrorToBackground(
        "API Key for Gemini is missing in autoquiz script."
      );
      return null;
    }
    try {
      log(
        "Đang gửi yêu cầu đến Gemini API cho câu hỏi: " +
          questionText.substring(0, 50) +
          "...",
        "info"
      );
      const requiredSelections = isCheckbox
        ? detectRequiredSelections(questionText)
        : 1;
      let prompt = `Đây là một câu hỏi ${
        isCheckbox ? "nhiều lựa chọn" : "trắc nghiệm"
      }: ${questionText}\n\n`;
      if (optionTexts.length > 0) {
        prompt += "Các lựa chọn:\n";
        optionTexts.forEach((option, index) => {
          const isIncorrect = incorrectOptions.includes(index);
          prompt += `${option}${
            isIncorrect ? " (Đã biết là sai từ lần thử trước)" : ""
          }\n`;
        });
        if (isCheckbox) {
          prompt += `\nHãy chọn ${requiredSelections} đáp án đúng nhất. `;
          if (incorrectOptions.length > 0)
            prompt +=
              "TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước. ";
          prompt +=
            "Chỉ trả lời các chữ cái tương ứng với đáp án (ví dụ: A, C). Liệt kê bằng dấu phẩy nếu có nhiều đáp án. Không giải thích.";
        } else {
          prompt +=
            "\nHãy trả lời câu hỏi này bằng cách chỉ đưa ra đáp án đúng ";
          if (incorrectOptions.length > 0)
            prompt +=
              "(TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước). ";
          prompt +=
            "Chỉ đưa ra chữ cái nếu là đáp án A, B, C, D... hoặc đưa ra nội dung đáp án đúng. Không giải thích.";
        }
      } else {
        prompt +=
          "Hãy trả lời câu hỏi này. Chỉ đưa ra đáp án, không giải thích.";
      }
      const response = await fetch(`${API_URL}?key=${geminiApiKey_autoquiz}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      });
      const data = await response.json();
      if (data.error) {
        log(`Lỗi Gemini API: ${data.error.message}`, "error");
        sendQuizErrorToBackground(`Lỗi Gemini API: ${data.error.message}`);
        return null;
      }
      const answer = data.candidates[0].content.parts[0].text.trim();
      log(`Gemini trả lời: ${answer}`, "success");
      return answer;
    } catch (error) {
      log(`Lỗi khi gọi Gemini API: ${error.message}`, "error");
      sendQuizErrorToBackground(`Lỗi khi gọi Gemini API: ${error.message}`);
      return null;
    }
  }

  function getOptionText(optionElement) {
    const textContainer = optionElement.querySelector(
      ".rc-CML [data-testid='cml-viewer']"
    );
    return textContainer ? textContainer.textContent.trim() : "";
  }

  function getOptionLabel(optionIndex) {
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return labels[optionIndex] || "";
  }

  function collectIncorrectAnswersFromResults() {
    if (stopAutoQuizScript) return false;
    const evaluatedQuestions = document.querySelectorAll(
      '[data-testid^="part-Submission_"][data-testid$="Question"]'
    );
    let collected = false;
    evaluatedQuestions.forEach((question) => {
      if (stopAutoQuizScript) return;
      const promptElement = question.querySelector(
        '[id^="prompt-autoGradableElementId"], [id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) return;
      const questionText = promptElement.textContent.trim();
      if (
        question.getAttribute("data-testid").includes("MultipleChoiceQuestion")
      ) {
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector('input[type="radio"]:checked');
          const isCorrect = option.parentElement.querySelector(".css-1ucwtwj");
          const answerText = getOptionText(option);
          if (isChecked && !isCorrect) {
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      } else if (
        question.getAttribute("data-testid").includes("CheckboxQuestion")
      ) {
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector(
            'input[type="checkbox"]:checked'
          );
          const optionContainer = option.closest(".css-18k2uoc");
          const optionId = optionContainer
            ? optionContainer.getAttribute("data-testid")
            : null;
          const isIncorrect = question.querySelector(
            `.css-pn7qkz[data-for="${optionId}"]`
          );
          const answerText = getOptionText(option);
          if (isChecked && isIncorrect) {
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
    });
    return collected;
  }

  // Hàm checkAndRetryQuiz cần được gọi cẩn thận, vì nó có thể điều hướng trang
  // hoặc bắt đầu lại quá trình xử lý câu hỏi.
  // Nó sẽ trả về true nếu retry được bắt đầu, false nếu không.
  async function checkAndRetryQuiz() {
    if (stopAutoQuizScript) return false;
    const gradeElement = document.querySelector(
      ".css-14nrrh0, h2.cds-389 span > span"
    );
    if (!gradeElement) {
      log("Không ở trang kết quả, không thể checkAndRetryQuiz", "info");
      return false;
    }
    const gradeText = gradeElement.textContent.trim();
    const gradePercentageMatch = gradeText.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!gradePercentageMatch) {
      log(`Không thể trích xuất điểm từ: "${gradeText}"`, "warning");
      return false;
    }
    const gradePercentage = parseFloat(gradePercentageMatch[1]);
    log(`Điểm hiện tại: ${gradePercentage}%`, "info");
    let passThreshold = 70;
    const passInfoText = document.body.textContent;
    const passMatch = passInfoText.match(
      /(?:to pass you need at least|need at least)\s*(\d+)%/i
    );
    if (passMatch) passThreshold = parseInt(passMatch[1]);
    log(`Ngưỡng đỗ cho quiz này là: ${passThreshold}%`, "info");

    if (gradePercentage < passThreshold) {
      log(
        `Quiz không đạt yêu cầu (${gradePercentage}% < ${passThreshold}%). Cần làm lại.`,
        "warning"
      );
      if (collectIncorrectAnswersFromResults()) {
        log("Đã thu thập các câu trả lời sai cho lần thử tiếp theo", "success");
      }
      const retryButton = document.querySelector(
        'button[data-testid="CoverPageActionButton"], button:contains("Resume")'
      );
      if (retryButton) {
        log("Đang click nút retry/resume trên trang kết quả...", "info");
        retryButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Chờ dialog có thể xuất hiện
        if (stopAutoQuizScript) return false;

        const continueButton = document.querySelector(
          '[data-testid="StartAttemptModal__primary-button"]'
        );
        if (continueButton) {
          log(
            "Đang click nút 'Continue' trong hộp thoại xác nhận 'Start new attempt'...",
            "info"
          );
          continueButton.click();
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Chờ trang load lại câu hỏi
          if (stopAutoQuizScript) return false;
          log(
            "Đã click 'Continue', bắt đầu xử lý câu hỏi cho lần thử mới.",
            "info"
          );
          await processAllQuestions(); // Gọi lại để xử lý lượt mới
          return true; // Đã bắt đầu retry
        } else {
          log(
            "Không tìm thấy nút 'Continue' trong dialog. Thử xử lý câu hỏi trực tiếp.",
            "warning"
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (stopAutoQuizScript) return false;
          await processAllQuestions();
          return true; // Giả sử đã bắt đầu retry
        }
      } else {
        log("Không tìm thấy nút retry/resume trên trang kết quả.", "warning");
        return false;
      }
    } else {
      log(
        `Quiz đã đạt yêu cầu (${gradePercentage}% >= ${passThreshold}%). Không cần làm lại.`,
        "success"
      );
      return false; // Không cần retry
    }
  }

  async function processMCQQuestions() {
    if (stopAutoQuizScript) return;
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_MultipleChoiceQuestion"]'
    );
    for (const container of questionContainers) {
      if (stopAutoQuizScript) break;
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;
      const questionText = promptElement.textContent.trim();
      log(
        "Đang xử lý câu hỏi MCQ: " + questionText.substring(0, 50) + "...",
        "info"
      );
      sendQuizProgressToBackground(
        questionText.substring(0, 30) + "...",
        "Đang tìm đáp án MCQ..."
      );

      const optionsContainer = container.querySelector('[role="radiogroup"]');
      if (!optionsContainer) {
        log("Không tìm thấy container đáp án (MCQ) cho câu hỏi", "warning");
        continue;
      }
      const optionElements = Array.from(
        optionsContainer.querySelectorAll(".rc-Option")
      );
      if (!optionElements.length) {
        log("Không tìm thấy đáp án nào cho câu hỏi (MCQ)", "warning");
        continue;
      }
      const alreadySelected = optionElements.some((option) =>
        option.querySelector('input[type="radio"]:checked')
      );
      if (alreadySelected) {
        log("Câu hỏi này đã được trả lời, bỏ qua", "info");
        continue;
      }
      const optionTexts = optionElements.map(
        (option, index) => `${getOptionLabel(index)}. ${getOptionText(option)}`
      );
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        if (isKnownIncorrectAnswer(questionText, getOptionText(option)))
          incorrectOptionIndices.push(index);
      });
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        false
      );
      if (!answer || stopAutoQuizScript) continue;

      const letterMatch = answer.match(/^([A-Z])(\.|$)/);
      let selected = false;
      if (letterMatch) {
        const letter = letterMatch[1];
        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);
        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);
          if (!isKnownIncorrectAnswer(questionText, optionText)) {
            const input = optionToSelect.querySelector("input");
            if (input && !input.checked) {
              input.click();
              log(
                `Đã chọn đáp án ${letter}: ${optionText.substring(0, 30)}...`,
                "success"
              );
              selected = true;
            }
          } else {
            log(
              `Gemini đề xuất đáp án ${letter} nhưng đã biết là sai.`,
              "warning"
            );
          }
        }
      }
      if (!selected) {
        // Nếu không chọn được theo chữ cái hoặc chữ cái đó bị sai
        let bestOption = null,
          bestOptionIndex = -1,
          bestOptionDistance = Infinity;
        optionElements.forEach((option, index) => {
          const optionText = getOptionText(option);
          if (isKnownIncorrectAnswer(questionText, optionText)) return;
          const distance = levenshtein(
            normalizeText(optionText),
            normalizeText(answer)
          );
          if (distance < bestOptionDistance) {
            bestOptionDistance = distance;
            bestOption = option;
            bestOptionIndex = index;
          }
        });
        if (bestOption) {
          const input = bestOption.querySelector("input");
          if (input && !input.checked) {
            input.click();
            log(
              `Đã chọn đáp án ${getOptionLabel(
                bestOptionIndex
              )} (gần nhất): ${getOptionText(bestOption).substring(0, 30)}...`,
              "success"
            );
            selected = true;
          }
        }
      }
      if (!selected) {
        // Fallback: chọn đáp án đầu tiên chưa bị đánh dấu sai
        const fallbackOption = optionElements.find(
          (opt) => !isKnownIncorrectAnswer(questionText, getOptionText(opt))
        );
        if (fallbackOption) {
          const input = fallbackOption.querySelector("input");
          if (input && !input.checked) {
            input.click();
            log(
              `Đã chọn đáp án dự phòng: ${getOptionText(
                fallbackOption
              ).substring(0, 30)}...`,
              "info"
            );
          }
        } else {
          log("Không còn đáp án nào để chọn cho MCQ này sau khi lọc.", "error");
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300)); // Chờ DOM update
    }
  }

  async function processCheckboxQuestions() {
    if (stopAutoQuizScript) return;
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_CheckboxQuestion"]'
    );
    for (const container of questionContainers) {
      if (stopAutoQuizScript) break;
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;
      const questionText = promptElement.textContent.trim();
      log(
        "Đang xử lý câu hỏi Checkbox: " + questionText.substring(0, 50) + "...",
        "info"
      );
      sendQuizProgressToBackground(
        questionText.substring(0, 30) + "...",
        "Đang tìm đáp án Checkbox..."
      );

      const optionsContainer = container.querySelector('[role="group"]');
      if (!optionsContainer) {
        log("Không tìm thấy container đáp án (Checkbox)", "warning");
        continue;
      }
      const optionElements = Array.from(
        container.querySelectorAll(".rc-Option")
      );
      if (!optionElements.length) {
        log("Không tìm thấy đáp án nào (Checkbox)", "warning");
        continue;
      }
      const requiredSelections = detectRequiredSelections(questionText);
      const selectedCount = optionElements.filter((option) =>
        option.querySelector('input[type="checkbox"]:checked')
      ).length;
      if (selectedCount >= requiredSelections) {
        log(
          `Câu hỏi đã có ${selectedCount}/${requiredSelections} lựa chọn`,
          "info"
        );
        continue;
      }

      // Bỏ chọn tất cả trước khi chọn lại dựa trên Gemini
      optionElements.forEach((opt) => {
        const chk = opt.querySelector('input[type="checkbox"]:checked');
        if (chk) chk.click();
      });
      await new Promise((resolve) => setTimeout(resolve, 200)); // Chờ DOM update
      if (stopAutoQuizScript) return;

      const optionTexts = optionElements.map(
        (option, index) => `${getOptionLabel(index)}. ${getOptionText(option)}`
      );
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        if (isKnownIncorrectAnswer(questionText, getOptionText(option)))
          incorrectOptionIndices.push(index);
      });
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        true
      );
      if (!answer || stopAutoQuizScript) continue;

      const selectedLetters = (answer.match(/[A-Z]/g) || []).filter(
        (v, i, a) => a.indexOf(v) === i
      ); // Lấy chữ cái unique
      log(`Gemini đề xuất cho checkbox: ${selectedLetters.join(", ")}`, "info");
      let currentSelections = 0;
      for (const letter of selectedLetters) {
        if (stopAutoQuizScript || currentSelections >= requiredSelections)
          break;
        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);
        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);
          if (!isKnownIncorrectAnswer(questionText, optionText)) {
            const input = optionToSelect.querySelector(
              "input[type='checkbox']"
            );
            if (input && !input.checked) {
              input.click();
              log(
                `Đã chọn đáp án ${letter}: ${optionText.substring(0, 30)}...`,
                "success"
              );
              currentSelections++;
            }
          }
        }
      }
      // Nếu chưa đủ và còn lựa chọn an toàn
      if (currentSelections < requiredSelections) {
        for (let i = 0; i < optionElements.length; i++) {
          if (stopAutoQuizScript || currentSelections >= requiredSelections)
            break;
          const optionToSelect = optionElements[i];
          const optionText = getOptionText(optionToSelect);
          const letter = getOptionLabel(i);
          if (
            !selectedLetters.includes(letter) &&
            !isKnownIncorrectAnswer(questionText, optionText)
          ) {
            const input = optionToSelect.querySelector(
              "input[type='checkbox']"
            );
            if (input && !input.checked) {
              input.click();
              log(
                `Đã chọn thêm đáp án an toàn ${letter}: ${optionText.substring(
                  0,
                  30
                )}...`,
                "info"
              );
              currentSelections++;
            }
          }
        }
      }
      log(`Đã chọn ${currentSelections}/${requiredSelections} đáp án.`, "info");
      await new Promise((resolve) => setTimeout(resolve, 300)); // Chờ DOM update
    }
  }

  async function processInputQuestion(selector, typeLabel) {
    if (stopAutoQuizScript) return;
    const containers = document.querySelectorAll(selector);
    for (const container of containers) {
      if (stopAutoQuizScript) break;
      const prompt = container.querySelector(
        '[id^="prompt-autoGradableResponseId"]'
      );
      if (!prompt) continue;
      const questionText = prompt.textContent.trim();
      log(
        `Đang xử lý câu hỏi ${typeLabel}: ` +
          questionText.substring(0, 50) +
          "...",
        "info"
      );
      sendQuizProgressToBackground(
        questionText.substring(0, 30) + "...",
        `Đang tìm đáp án ${typeLabel}...`
      );
      const inputElement = container.querySelector(
        'input[type="text"], input[type="number"]'
      );
      if (!inputElement) {
        log("Không tìm thấy input", "warning");
        continue;
      }
      if (inputElement.value.trim()) {
        log("Input đã có giá trị", "info");
        continue;
      }
      const answer = await getAnswerFromGemini(questionText);
      if (!answer || stopAutoQuizScript) continue;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputElement, answer);
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      log(`Đã điền input ${typeLabel} với: ${answer}`, "success");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  function forceClickSubmitButton() {
    if (stopAutoQuizScript) return false;
    log("Đang tìm kiếm các nút submit...", "info");
    const submitButtons = Array.from(
      document.querySelectorAll("button")
    ).filter(
      (button) =>
        button.textContent.includes("Submit") ||
        button.getAttribute("aria-label") === "Submit" ||
        button.getAttribute("data-testid") === "submit-button"
    );
    for (const button of submitButtons) {
      const isDisabled =
        button.disabled ||
        button.getAttribute("aria-disabled") === "true" ||
        button.classList.contains("cds-button-disabled");
      if (!isDisabled) {
        log(`Đang click nút submit: ${button.textContent.trim()}`, "info");
        button.click();
        return true;
      }
    }
    log("Không tìm thấy nút submit nào có thể click.", "warning");
    return false;
  }

  function handleReadyToSubmitDialog() {
    if (stopAutoQuizScript) return false;
    const dialogSubmitButton = document.querySelector(
      'button[data-testid="dialog-submit-button"], .css-6z6oep button.cds-button-primary'
    );
    if (dialogSubmitButton) {
      log(
        "Đã tìm thấy dialog 'Ready to submit', đang click nút Submit...",
        "info"
      );
      dialogSubmitButton.click();
      return true;
    }
    return false;
  }

  // Hàm processAllQuestions là trung tâm xử lý trong một trang quiz
  async function processAllQuestions() {
    if (stopAutoQuizScript) {
      log("processAllQuestions bị dừng bởi cờ.", "warning");
      return;
    }
    log("Bắt đầu xử lý tất cả câu hỏi trên trang...", "info");
    sendQuizProgressToBackground("Xử lý câu hỏi", "Bắt đầu phân tích trang...");

    try {
      // Kiểm tra các dialog trước
      const missingAnswersDialogHeading =
        document.querySelector("h2.css-tlf8h5");
      if (
        missingAnswersDialogHeading &&
        missingAnswersDialogHeading.textContent
          .trim()
          .toLowerCase()
          .includes("missing or invalid answers")
      ) {
        log("Đã tìm thấy dialog 'Missing or invalid answers'.", "warning");
        const cancelButton = document.querySelector(
          'button[data-testid="dialog-cancel-button"]'
        );
        if (cancelButton) {
          log("Đang click nút 'Cancel' để sửa.", "info");
          cancelButton.click();
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (stopAutoQuizScript) return;
          await processAllQuestions(); // Thử lại
          return;
        }
      }
      if (handleReadyToSubmitDialog()) {
        // Nếu dialog submit hiện ra, click nó và dừng
        log("Đã xử lý dialog 'Ready to Submit'. Chờ kết quả.", "info");
        // Không return ngay, để checkQuizCompletionInterval có cơ hội chạy
        // Nhưng không nên gọi lại processAllQuestions nữa.
        // Chờ injectAutoQuizScriptInternal kiểm tra kết quả.
        return;
      }

      // Kiểm tra xem có phải trang kết quả và cần retry không
      if (await checkAndRetryQuiz()) {
        // checkAndRetryQuiz đã tự gọi processAllQuestions nếu cần retry
        log(
          "Đã bắt đầu làm lại quiz (thông qua checkAndRetryQuiz).",
          "warning"
        );
        return;
      }
      if (stopAutoQuizScript) return;

      const startAttemptDialog = document.querySelector(
        '[data-testid="StartAttemptModal__heading"]'
      );
      if (startAttemptDialog) {
        log(
          "Đã tìm thấy dialog 'Start new attempt', đang click Continue...",
          "info"
        );
        const continueButton = document.querySelector(
          '[data-testid="StartAttemptModal__primary-button"]'
        );
        if (continueButton) {
          continueButton.click();
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (stopAutoQuizScript) return;
          await processAllQuestions(); // Gọi lại sau khi dialog được xử lý
          return;
        }
      }
      if (stopAutoQuizScript) return;

      log("Bắt đầu xử lý các loại câu hỏi...", "info");
      await processMCQQuestions();
      if (stopAutoQuizScript) return;
      await processCheckboxQuestions();
      if (stopAutoQuizScript) return;
      await processInputQuestion(
        'div[data-testid="part-Submission_RegexQuestion"]',
        "Regex"
      );
      if (stopAutoQuizScript) return;
      await processInputQuestion(
        'div[data-testid="part-Submission_NumericQuestion"]',
        "Numeric"
      );
      if (stopAutoQuizScript) return;

      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (stopAutoQuizScript) return;

      const agreementCheckbox = document.querySelector(
        'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
      );
      if (agreementCheckbox && !agreementCheckbox.checked) {
        agreementCheckbox.click();
        log("Đã tick vào ô đồng ý.", "success");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (stopAutoQuizScript) return;

      log("Đang tìm và chờ nút submit được enable...", "info");
      let submitButton = null;
      let attemptsToFindSubmit = 0;
      const maxAttemptsToFindSubmit = 10;
      while (
        attemptsToFindSubmit < maxAttemptsToFindSubmit &&
        !stopAutoQuizScript
      ) {
        submitButton = document.querySelector(
          'button[data-testid="submit-button"], .css-hb4vw3 > button[data-testid="submit-button"]'
        );
        if (submitButton && !submitButton.disabled) {
          log("Đã tìm thấy nút submit ENABLED.", "success");
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attemptsToFindSubmit++;
      }
      if (stopAutoQuizScript) return;

      if (submitButton && !submitButton.disabled) {
        log("Đang click nút submit chính...", "info");
        submitButton.click();
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Chờ dialog hoặc kết quả
        if (stopAutoQuizScript) return;

        // Sau khi submit, kiểm tra lại dialog một lần nữa
        if (handleReadyToSubmitDialog()) {
          // Nếu có dialog submit, xử lý nó
          log(
            "Dialog 'Ready to submit' xuất hiện sau khi click submit chính, đã xử lý.",
            "info"
          );
        } else {
          // Nếu không có dialog, có thể đã submit thành công hoặc có lỗi.
          // injectAutoQuizScriptInternal sẽ kiểm tra kết quả.
          log(
            "Không có dialog 'Ready to submit' sau khi click submit chính. Chờ kiểm tra kết quả.",
            "info"
          );
        }
      } else {
        log(
          "Không thể click nút submit (không tìm thấy hoặc vẫn bị disabled).",
          "error"
        );
        sendQuizErrorToBackground(
          "Không tìm thấy/click được nút Submit cuối cùng."
        );
        // Không dừng hẳn, để injectAutoQuizScriptInternal có thể thử lại hoặc báo cáo
      }
    } catch (error) {
      log(`Lỗi nghiêm trọng khi xử lý câu hỏi: ${error.message}`, "error");
      sendQuizErrorToBackground(
        `Lỗi nghiêm trọng trong processAllQuestions: ${error.message}`
      );
    }
    // Không tự động gọi injectAutoQuizScriptInternal ở đây nữa.
    // injectAutoQuizScriptInternal sẽ có vòng lặp riêng để kiểm tra hoàn thành.
  }

  // Đổi tên hàm injectAutoQuizScript thành injectAutoQuizScriptInternal để tránh trùng với hàm global
  async function injectAutoQuizScriptInternal() {
    if (stopAutoQuizScript) {
      log("injectAutoQuizScriptInternal bị dừng.", "warning");
      if (chrome.runtime && chrome.runtime.sendMessage)
        chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
      return;
    }
    log("Đang chạy script xử lý quiz (phiên bản internal)...", "info");
    sendQuizProgressToBackground("Xử lý Quiz", "Bắt đầu...");

    try {
      await processAllQuestions(); // Xử lý câu hỏi một lần
      if (stopAutoQuizScript) {
        if (chrome.runtime && chrome.runtime.sendMessage)
          chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
        return;
      }
      log(
        "Đã chạy processAllQuestions(). Bắt đầu kiểm tra hoàn thành quiz.",
        "success"
      );
    } catch (error) {
      log(`Lỗi trong quá trình processAllQuestions: ${error.message}`, "error");
      sendQuizErrorToBackground(
        `Lỗi trong processAllQuestions: ${error.message}`
      );
      // Không dừng hẳn, để vòng lặp kiểm tra có thể thử lại hoặc báo cáo
    }

    // Vòng lặp kiểm tra hoàn thành quiz và retry
    let checkAttempts = 0;
    const maxCheckAttempts = 20; // Kiểm tra trong khoảng 1 phút (20 * 3s)
    const checkInterval = setInterval(async () => {
      if (stopAutoQuizScript || checkAttempts >= maxCheckAttempts) {
        clearInterval(checkInterval);
        log(
          stopAutoQuizScript
            ? "Dừng kiểm tra hoàn thành quiz do yêu cầu."
            : "Hết thời gian kiểm tra hoàn thành quiz.",
          "warning"
        );
        processingQuiz = false;
        if (chrome.runtime && chrome.runtime.sendMessage)
          chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
        return;
      }
      checkAttempts++;
      log(`Kiểm tra hoàn thành quiz lần ${checkAttempts}...`, "info");
      sendQuizProgressToBackground("Kiểm tra kết quả", `Lần ${checkAttempts}`);

      const gradeElement = document.querySelector(
        'div[data-testid="AssignmentViewTopBanner"] h2.cds-Typography-base span.cds-Typography-base span, .css-14nrrh0, h2.cds-389 span > span'
      );
      if (gradeElement) {
        const gradeText = gradeElement.textContent.trim();
        const gradePercentageMatch = gradeText.match(/(\d+(?:\.\d+)?)\s*%/);
        if (!gradePercentageMatch) {
          log(
            `Không thể trích xuất điểm phần trăm từ: "${gradeText}". Chờ thêm...`,
            "warning"
          );
          return; // Tiếp tục chờ trong interval
        }
        const gradePercentage = parseFloat(gradePercentageMatch[1]);
        let passThreshold = 70;
        const passInfoText = document.body.textContent;
        const passMatch = passInfoText.match(
          /(?:to pass you need at least|need at least)\s*(\d+)%/i
        );
        if (passMatch) passThreshold = parseInt(passMatch[1]);
        log(
          `Điểm quiz: ${gradePercentage}%, Ngưỡng đỗ: ${passThreshold}%`,
          "info"
        );

        if (gradePercentage >= passThreshold) {
          log(
            `Quiz ĐÃ ĐẠT với điểm: ${gradePercentage}% >= ${passThreshold}%`,
            "success"
          );
          clearInterval(checkInterval);
          processingQuiz = false;
          // Thông báo hoàn thành cho background
          if (chrome.runtime && chrome.runtime.sendMessage)
            chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
          // Không tự động điều hướng, background sẽ quyết định
        } else {
          log(
            `Quiz KHÔNG ĐẠT (${gradePercentage}% < ${passThreshold}%). Thử làm lại...`,
            "error"
          );
          clearInterval(checkInterval); // Dừng kiểm tra hiện tại để retry
          if (await checkAndRetryQuiz()) {
            // checkAndRetryQuiz sẽ gọi lại processAllQuestions
            log(
              "Đã bắt đầu làm lại quiz. injectAutoQuizScriptInternal sẽ được gọi lại nếu cần.",
              "info"
            );
            // injectAutoQuizScriptInternal(); // Không gọi trực tiếp, để checkAndRetryQuiz xử lý
          } else {
            log("Không thể làm lại quiz hoặc đã hết lượt.", "warning");
            sendQuizErrorToBackground(
              "Không thể làm lại quiz sau khi không đạt."
            );
            processingQuiz = false;
            if (chrome.runtime && chrome.runtime.sendMessage)
              chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
          }
        }
      } else if (window.location.href.includes("/home/")) {
        // Nếu đã quay về trang home/module
        log(
          "Đã quay lại trang chủ/module. Dừng kiểm tra hoàn thành quiz này.",
          "info"
        );
        clearInterval(checkInterval);
        processingQuiz = false;
        if (chrome.runtime && chrome.runtime.sendMessage)
          chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
      }
      // Nếu không thấy gradeElement và không ở trang home, tiếp tục chờ
    }, 3000);
  }

  // Hàm này sẽ được gọi khi trang là một trang quiz và cần bắt đầu xử lý.
  // Nó sẽ không tự tìm module hay điều hướng.
  async function mainQuizProcessingLogic() {
    if (stopAutoQuizScript) {
      log("mainQuizProcessingLogic bị dừng bởi cờ.", "warning");
      if (chrome.runtime && chrome.runtime.sendMessage)
        chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
      return;
    }

    log(
      "Bên trong mainQuizProcessingLogic. Bắt đầu kiểm tra trạng thái trang."
    );

    const overviewButtonSelector =
      'button[data-testid="start-button"], button:contains("Resume")';
    const isQuizOverviewPage = document.querySelector(overviewButtonSelector);
    log(
      `Kiểm tra isQuizOverviewPage (selector: "${overviewButtonSelector}"): ${
        isQuizOverviewPage ? "Tìm thấy phần tử" : "KHÔNG tìm thấy phần tử"
      }. Chi tiết phần tử (nếu có): ${
        isQuizOverviewPage
          ? isQuizOverviewPage.outerHTML.substring(0, 100) + "..."
          : "N/A"
      }`,
      isQuizOverviewPage ? "info" : "warning"
    );

    const questionSelector = '[data-testid^="part-Submission_"]';
    const isInsideQuizPage = document.querySelector(questionSelector);
    log(
      `Kiểm tra isInsideQuizPage (selector: "${questionSelector}"): ${
        isInsideQuizPage ? "Tìm thấy phần tử" : "KHÔNG tìm thấy phần tử"
      }. Chi tiết phần tử (nếu có): ${
        isInsideQuizPage
          ? isInsideQuizPage.outerHTML.substring(0, 100) + "..."
          : "N/A"
      }`,
      isInsideQuizPage ? "info" : "warning"
    );

    if (isQuizOverviewPage) {
      log(
        "mainQuizProcessingLogic: Nhánh isQuizOverviewPage = true. Gọi findAttemptableQuizzesOnPage()."
      );
      const quizzesOnPage = findAttemptableQuizzesOnPage(); // Dùng hàm này để tìm quiz trên trang hiện tại
      if (quizzesOnPage.length > 0) {
        log(
          `mainQuizProcessingLogic: Tìm thấy ${quizzesOnPage.length} quiz. Bắt đầu với quiz đầu tiên: ${quizzesOnPage[0].title}`,
          "success"
        );
        openAndStartQuiz(quizzesOnPage[0]); // Hàm này sẽ gọi injectAutoQuizScriptInternal
      } else {
        log(
          "mainQuizProcessingLogic: Đang ở trang overview nhưng findAttemptableQuizzesOnPage không tìm thấy quiz. Gửi AUTOQUIZ_DONE.",
          "warning"
        );
        if (chrome.runtime && chrome.runtime.sendMessage)
          chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
      }
    } else if (isInsideQuizPage) {
      log(
        "mainQuizProcessingLogic: Nhánh isInsideQuizPage = true. Gọi injectAutoQuizScriptInternal().",
        "info"
      );
      await injectAutoQuizScriptInternal();
    } else {
      log(
        "mainQuizProcessingLogic: Cả isQuizOverviewPage và isInsideQuizPage đều false. Không xác định được trạng thái trang quiz. Gửi AUTOQUIZ_DONE.",
        "error"
      );
      if (chrome.runtime && chrome.runtime.sendMessage)
        chrome.runtime.sendMessage({ type: "AUTOQUIZ_DONE" });
    }
  }

  // ------ END Nội dung của improved_autoquiz.js gốc ------

  // Chạy logic chính của autoquiz
  await mainQuizProcessingLogic();
  // Sau khi mainQuizProcessingLogic hoàn thành (hoặc các hàm con của nó gửi AUTOQUIZ_DONE),
  // script này coi như đã xong nhiệm vụ của nó cho lần inject này.
  log(
    "Logic chính của AutoQuiz (mainQuizProcessingLogic) đã chạy xong.",
    "info"
  );
  // Không gửi AUTOQUIZ_DONE ở đây nữa, vì các nhánh logic bên trong đã gửi.
}

// Lắng nghe API key từ background script qua postMessage
// (vì executeScript không dễ dàng truyền tham số vào IIFE đã được sửa đổi)
window.addEventListener(
  "message",
  (event) => {
    if (
      event.source === window &&
      event.data &&
      event.data.type === "COURSERA_AUTOQUIZ_API_KEY"
    ) {
      if (event.data.apiKey) {
        // Kiểm tra xem script đã được khởi chạy lần nào chưa để tránh chạy nhiều lần
        if (!window.courseraAutoQuizStarted) {
          window.courseraAutoQuizStarted = true;
          startCourseraAutoQuiz(event.data.apiKey);
        } else {
          sendQuizLogToBackground(
            "AutoQuiz script đã được khởi chạy trước đó, bỏ qua lần gọi này.",
            "warning"
          );
        }
      } else {
        sendQuizErrorToBackground(
          "Không nhận được API key từ background qua postMessage."
        );
      }
    }
  },
  false
);

// Báo cho background biết content_autoquiz.js đã sẵn sàng nhận API key
sendQuizLogToBackground(
  "content_autoquiz.js đã load và sẵn sàng nhận API key.",
  "info"
);

// Để tránh trường hợp IIFE cũ vẫn chạy nếu file chưa được ghi đè hoàn toàn:
// (function() {})(); // Xóa hoặc comment dòng này nếu có trong file gốc.
