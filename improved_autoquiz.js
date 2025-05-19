// Script tự động làm quiz trên Coursera
(function () {
  // Thông tin để ghi log
  const DEBUG = true;

  // Gemini API config
  const API_KEY = "KEY";
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Những từ khóa để phát hiện quiz
  const QUIZ_KEYWORDS = ["quiz", "graded", "assignment"];

  // Từ khóa để bỏ qua
  const SKIP_KEYWORDS = ["peer", "peer-graded"];

  // Trạng thái
  let moduleQueue = [];
  let currentModule = null;
  let processingQuiz = false;
  let moduleProcessingComplete = false;

  // Lưu trữ thông tin về các câu hỏi đã làm và đáp án sai để tránh chọn lại
  const STORAGE_KEY = "quiz_incorrect_answers";

  // Thêm các biến toàn cục này ở đầu IIFE của bạn, gần chỗ khai báo moduleQueue cũ
  let allAvailableModules = [];
  let currentModuleToProcess = null; // Object: {url, element, title, moduleNumber}

  // Helper function để lấy số thứ tự module từ URL (để sắp xếp)
  function extractModuleNumber(url) {
    const match = url.match(/\/module\/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // Log với màu nếu Debug mode bật
  function log(message, type = "info") {
    if (!DEBUG) return;

    const styles = {
      info: "color: #3498db; font-weight: bold;",
      success: "color: #2ecc71; font-weight: bold;",
      warning: "color: #f39c12; font-weight: bold;",
      error: "color: #e74c3c; font-weight: bold;",
    };

    console.log(`%c[COURSERA-AUTO] ${message}`, styles[type] || styles.info);
  }

  // Tìm tất cả các module trong khóa học
  function findAllModules() {
    log("Đang tìm tất cả các module có thể click...");
    let modules = [];
    // Selector này cần nhắm đúng vào các link/button chuyển module chính của khóa học
    const moduleElements = document.querySelectorAll(
      'a[href*="/home/module/"]'
    );
    const uniqueUrls = new Set();

    moduleElements.forEach((link) => {
      const href = link.getAttribute("href").split("#")[0];
      if (href.includes("/home/module/") && !uniqueUrls.has(href)) {
        uniqueUrls.add(href);
        modules.push({
          url: href,
          element: link,
          title: link.textContent.trim() || href,
          moduleNumber: extractModuleNumber(href),
        });
      }
    });

    modules.sort((a, b) => a.moduleNumber - b.moduleNumber); // Sắp xếp theo số module
    modules.forEach((m) =>
      log(`Đã tìm thấy module: ${m.title} (URL: ${m.url})`, "info")
    );
    return modules;
  }

  // Kiểm tra xem một element có chứa bất kỳ từ khóa nào không
  function containsKeywords(element, keywords) {
    if (!element) return false;

    const text = element.textContent.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  // Kiểm tra xem một quiz có cần bỏ qua hay không
  function shouldSkipQuiz(quizElement) {
    return containsKeywords(quizElement, SKIP_KEYWORDS);
  }

  // Lấy ngưỡng đỗ (pass threshold) từ thông tin quiz
  function getPassThreshold(quizElement) {
    // Mặc định là 70%
    let threshold = 70;

    // Trong trang chi tiết quiz có thể có thông tin ngưỡng đỗ
    const passInfoText = quizElement.textContent;
    const passMatch = passInfoText.match(/need at least (\d+)%/);

    if (passMatch) {
      threshold = parseInt(passMatch[1]);
    }

    return threshold;
  }

  // Kiểm tra xem một quiz đã pass chưa
  function isQuizPassed(quizElement) {
    // Nếu có chứa "Failed", thì chắc chắn không pass
    if (quizElement.querySelector('[data-testid$="Failed"]')) {
      log("Quiz có trạng thái Failed", "warning");
      return false;
    }

    // Lấy ngưỡng đỗ cho quiz này
    const passThreshold = getPassThreshold(quizElement);

    // Kiểm tra xem có chứa điểm và lớn hơn hoặc bằng ngưỡng đỗ
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

    // Kiểm tra xem quiz đã được hoàn thành chưa (Completed) nhưng không có thông tin điểm
    if (quizElement.querySelector('img[alt="Completed"]') && !gradeMatch) {
      // Không có thông tin điểm rõ ràng, giả định là chưa pass để chắc chắn
      log(
        "Quiz đã hoàn thành nhưng không có thông tin điểm rõ ràng",
        "warning"
      );
      return false;
    }

    // Không tìm thấy thông tin điểm
    return false;
  }

  // Kiểm tra xem một quiz có thể làm được không
  function isQuizAttemptable(quizElement) {
    // Kiểm tra xem có chứa trạng thái "Failed"
    const hasFailed =
      quizElement.querySelector('[data-testid$="Failed"]') !== null;
    if (hasFailed) {
      log("Đã tìm thấy quiz với trạng thái Failed", "warning");
      return true;
    }

    // Lấy ngưỡng đỗ cho quiz này
    const passThreshold = getPassThreshold(quizElement);

    // Kiểm tra xem có điểm dưới ngưỡng đỗ không
    const gradeText = quizElement.textContent;
    const gradeMatch = gradeText.match(/Grade:\s*(\d+)%/);
    if (gradeMatch && parseInt(gradeMatch[1]) < passThreshold) {
      log(
        `Quiz có điểm ${gradeMatch[1]}% < ${passThreshold}%, có thể làm lại`,
        "warning"
      );
      return true;
    }

    // Kiểm tra xem có nút "Start" hoặc "Resume" (hiển thị là "Grade: --")
    const hasEmptyGrade = gradeText.includes("Grade: --");
    if (hasEmptyGrade) {
      log("Quiz chưa làm (Grade: --), có thể làm", "info");
      return true;
    }

    return false;
  }

  // Tìm các quiz có thể làm trong module hiện tại
  function findAttemptableQuizzes() {
    log("Đang tìm các quiz có thể làm...");
    const attemptableQuizzes = [];

    // Tìm tất cả các liên kết trong module
    const allLinks = document.querySelectorAll("a");

    allLinks.forEach((link) => {
      // Kiểm tra xem liên kết có chứa từ khóa quiz hay không
      if (containsKeywords(link, QUIZ_KEYWORDS)) {
        // Kiểm tra xem có phải peer-graded hay không
        if (shouldSkipQuiz(link)) {
          log(`Bỏ qua quiz peer-graded: ${link.textContent}`, "warning");
          return;
        }

        // Kiểm tra xem quiz đã pass chưa
        if (!isQuizPassed(link)) {
          // Kiểm tra xem quiz có thể làm được không
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

    return attemptableQuizzes;
  }

  // Cải tiến hàm để tìm và click nút Resume
  function findAndClickResumeButton() {
    log("Đang tìm nút Resume...", "info");

    // Thử tìm nút có text chính xác là "Resume" trước tiên
    const allButtons = Array.from(document.querySelectorAll("button"));
    const exactResumeButton = allButtons.find(
      (btn) => btn.textContent.trim() === "Resume"
    );

    if (exactResumeButton) {
      log("Tìm thấy nút chính xác với text 'Resume'", "success");
      setTimeout(() => {
        log("Đang click nút Resume...", "info");
        exactResumeButton.click();
      }, 1000); // Thêm delay 1 giây để đảm bảo
      return true;
    }

    // Tiếp theo, thử tìm trong các container cụ thể
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
          log("Đang click nút Resume trong container...", "info");
          resumeButtonInContainer.click();
        }, 1000);
        return true;
      }
    }

    // Thử tìm bằng class và text content
    const resumeButtonByClass = document.querySelector(
      "button.cds-button-primary, button.cds-307"
    );
    if (
      resumeButtonByClass &&
      resumeButtonByClass.textContent.toLowerCase().includes("resume")
    ) {
      log("Tìm thấy nút Resume bằng class", "success");
      setTimeout(() => {
        log("Đang click nút Resume bằng class...", "info");
        resumeButtonByClass.click();
      }, 1000);
      return true;
    }

    // Cuối cùng, tìm nút có chứa từ "Resume"
    const resumeButton = allButtons.find((btn) =>
      btn.textContent.toLowerCase().includes("resume")
    );

    if (resumeButton) {
      log("Tìm thấy nút có chứa text 'Resume'", "success");
      setTimeout(() => {
        log("Đang click nút Resume chứa text...", "info");
        resumeButton.click();
      }, 1000);
      return true;
    }

    // Log thông tin nếu không tìm thấy
    log("Không tìm thấy nút Resume, các nút trên trang:", "error");
    allButtons.forEach((btn, i) => {
      log(
        `[${i}] "${btn.textContent.trim()}" - class="${btn.className}"`,
        "info"
      );
    });

    return false;
  }

  // Cập nhật hàm openAndStartQuiz
  function openAndStartQuiz(quizInfo) {
    log(`Đang mở quiz: ${quizInfo.title}`, "info");
    processingQuiz = true;

    quizInfo.element.click(); // Click vào link quiz

    log("Đang đợi trang quiz load...", "info");

    // Kiểm tra định kỳ sự hiện diện của nút Start/Resume
    let attempts = 0;
    const maxAttempts = 7; // Tăng số lần thử lên một chút (14 giây)
    const intervalId = setInterval(() => {
      attempts++;
      log(`Tìm nút Resume/Start lần ${attempts}...`, "info");

      // Ưu tiên tìm nút Start trước
      const startSelectors = [
        'button[data-testid="start-button"]', // Selector hiện tại
        'button[data-testid="StartButton"]', // Thêm biến thể data-testid
        'button.cds-button-primary:not([disabled]):not([aria-disabled="true"]) span.cds-button-label:contains("Start")',
        'button:contains("Start")', // Tìm nút có text là "Start"
        'button[aria-label*="Start"]', // Tìm nút có aria-label chứa "Start"
      ];

      for (const selector of startSelectors) {
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
          // Kiểm tra có hiển thị không
          log(
            `Đã tìm thấy nút Start với selector: "${selector}", đang click...`,
            "success"
          );
          startButton.click();
          clearInterval(intervalId); // Dừng kiểm tra
          setTimeout(injectAutoQuizScript, 3000); // Chờ inject script
          return;
        }
      }

      // Nếu không thấy nút Start, thử tìm nút Resume
      if (findAndClickResumeButton()) {
        log(
          "Đã tìm và click nút Resume (sau khi không thấy Start).",
          "success"
        );
        clearInterval(intervalId); // Dừng kiểm tra
        setTimeout(injectAutoQuizScript, 3000); // Chờ inject script
        return;
      }

      // Nếu đã thử quá nhiều lần, dừng lại
      if (attempts >= maxAttempts) {
        log("Không tìm thấy nút Start hoặc Resume sau nhiều lần thử!", "error");
        clearInterval(intervalId);
        processingQuiz = false;
        navigateToNextModule(); // Chuyển sang module tiếp theo nếu không tìm thấy nút
      }
    }, 2000); // Kiểm tra mỗi 2 giây
  }

  // Lấy dữ liệu câu trả lời sai từ localStorage
  function getIncorrectAnswers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      log("Lỗi khi truy xuất câu trả lời sai từ storage:", "error");
      return {};
    }
  }

  // Lưu dữ liệu câu trả lời sai vào localStorage
  function saveIncorrectAnswers(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      log("Lỗi khi lưu câu trả lời sai vào storage:", "error");
    }
  }

  // Thêm đáp án không đúng vào danh sách tránh
  function addIncorrectAnswer(questionText, incorrectAnswerText) {
    const data = getIncorrectAnswers();
    if (!data[questionText]) {
      data[questionText] = [];
    }
    // Thêm câu trả lời sai nếu chưa có trong danh sách
    if (!data[questionText].includes(incorrectAnswerText)) {
      data[questionText].push(incorrectAnswerText);
    }
    saveIncorrectAnswers(data);
    log(
      `Đã thêm câu trả lời sai: "${questionText}": "${incorrectAnswerText}"`,
      "warning"
    );
  }

  // Kiểm tra xem đáp án có được đánh dấu là sai từ trước không
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

  // Hàm chuẩn hóa văn bản: loại bỏ khoảng trắng thừa và chuyển về chữ thường
  function normalizeText(text) {
    return text?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  }

  // Hàm tính khoảng cách Levenshtein giữa 2 chuỗi
  function levenshtein(a, b) {
    const m = a.length,
      n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const matrix = [];
    for (let i = 0; i <= n; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= m; j++) {
      matrix[0][j] = j;
    }
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

  // Phát hiện số lượng lựa chọn cần chọn từ câu hỏi
  function detectRequiredSelections(questionText) {
    // Tìm các mẫu như "Select two", "Choose three", etc.
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

      if (wordToNumber[numWord]) {
        return wordToNumber[numWord];
      } else if (!isNaN(parseInt(numWord))) {
        return parseInt(numWord);
      }
    }

    // Mặc định là 1 nếu không tìm thấy
    return 1;
  }

  // Hàm gọi API Gemini để lấy đáp án cho câu hỏi
  async function getAnswerFromGemini(
    questionText,
    optionTexts = [],
    incorrectOptions = [],
    isCheckbox = false
  ) {
    try {
      log(
        "Đang gửi yêu cầu đến Gemini API cho câu hỏi: " +
          questionText.substring(0, 50) +
          "...",
        "info"
      );

      // Xác định số lượng lựa chọn cần chọn
      const requiredSelections = isCheckbox
        ? detectRequiredSelections(questionText)
        : 1;

      // Xây dựng prompt với các lựa chọn và đánh dấu những đáp án đã biết là sai
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

          if (incorrectOptions.length > 0) {
            prompt +=
              "TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước. ";
          }

          prompt +=
            "Chỉ trả lời các chữ cái tương ứng với đáp án (ví dụ: A, C). Liệt kê bằng dấu phẩy nếu có nhiều đáp án. Không giải thích.";
        } else {
          prompt +=
            "\nHãy trả lời câu hỏi này bằng cách chỉ đưa ra đáp án đúng ";

          if (incorrectOptions.length > 0) {
            prompt +=
              "(TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước). ";
          }

          prompt +=
            "Chỉ đưa ra chữ cái nếu là đáp án A, B, C, D... hoặc đưa ra nội dung đáp án đúng. Không giải thích.";
        }
      } else {
        prompt +=
          "Hãy trả lời câu hỏi này. Chỉ đưa ra đáp án, không giải thích.";
      }

      const response = await fetch(`${API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        log(`Lỗi Gemini API: ${data.error.message}`, "error");
        return null;
      }

      // Lấy text từ response
      const answer = data.candidates[0].content.parts[0].text.trim();
      log(`Gemini trả lời: ${answer}`, "success");
      return answer;
    } catch (error) {
      log(`Lỗi khi gọi Gemini API: ${error}`, "error");
      return null;
    }
  }

  // Dành cho MCQ: lấy text của một option
  function getOptionText(optionElement) {
    // Lấy text từ thẻ CML viewer bên trong option
    const textContainer = optionElement.querySelector(
      ".rc-CML [data-testid='cml-viewer']"
    );
    return textContainer ? textContainer.textContent.trim() : "";
  }

  // Lấy label (A, B, C, D) của option
  function getOptionLabel(optionIndex) {
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return labels[optionIndex] || "";
  }

  // Kiểm tra và thu thập dữ liệu câu trả lời đúng/sai từ trang kết quả
  function collectIncorrectAnswersFromResults() {
    // Tìm tất cả câu hỏi đã được đánh giá
    const evaluatedQuestions = document.querySelectorAll(
      '[data-testid^="part-Submission_"][data-testid$="Question"]'
    );
    let collected = false;

    evaluatedQuestions.forEach((question) => {
      // Tìm văn bản câu hỏi
      const promptElement = question.querySelector(
        '[id^="prompt-autoGradableElementId"], [id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) return;

      const questionText = promptElement.textContent.trim();

      // Xử lý câu hỏi radio (MCQ)
      if (
        question.getAttribute("data-testid").includes("MultipleChoiceQuestion")
      ) {
        // Tìm các option và xác định đáp án được chọn nhưng sai
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector('input[type="radio"]:checked');
          const isCorrect = option.parentElement.querySelector(".css-1ucwtwj"); // Icon correct
          const isIncorrect = option.parentElement.querySelector(".css-pn7qkz"); // Icon incorrect

          const answerText = getOptionText(option);

          if (isChecked && !isCorrect) {
            // Đây là đáp án đã chọn nhưng sai
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
      // Xử lý câu hỏi checkbox (multiple select)
      else if (
        question.getAttribute("data-testid").includes("CheckboxQuestion")
      ) {
        // Tìm các option đã chọn nhưng sai
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector(
            'input[type="checkbox"]:checked'
          );

          // Kiểm tra xem option này có được đánh dấu là incorrect không
          const optionContainer = option.closest(".css-18k2uoc");
          const optionId = optionContainer
            ? optionContainer.getAttribute("data-testid")
            : null;
          const isIncorrect = question.querySelector(
            `.css-pn7qkz[data-for="${optionId}"]`
          );

          const answerText = getOptionText(option);

          if (isChecked && isIncorrect) {
            // Đây là đáp án đã chọn nhưng sai
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
    });

    return collected;
  }

  // Kiểm tra xem có cần retry quiz không
  function checkAndRetryQuiz() {
    // Kiểm tra xem có đang ở trang kết quả không (có hiển thị grade)
    const gradeElement = document.querySelector(
      ".css-14nrrh0, h2.cds-389 span > span" // Thêm selector cho grade mới
    );
    if (!gradeElement) {
      log("Không ở trang kết quả, không thể checkAndRetryQuiz", "info");
      return false;
    }

    // Lấy điểm và kiểm tra xem có pass không
    const gradeText = gradeElement.textContent.trim();
    const gradePercentageMatch = gradeText.match(/(\d+(?:\.\d+)?)\s*%/);
    if (!gradePercentageMatch) {
      log(`Không thể trích xuất điểm từ: "${gradeText}"`, "warning");
      return false; // Không thể xác định điểm, không retry
    }
    const gradePercentage = parseFloat(gradePercentageMatch[1]);

    log(`Điểm hiện tại: ${gradePercentage}%`, "info");

    // Lấy ngưỡng đỗ từ thông tin trang
    let passThreshold = 70;
    const passInfoText = document.body.textContent; // Tìm trong cả body cho chắc
    const passMatch = passInfoText.match(
      /(?:to pass you need at least|need at least)\s*(\d+)%/i
    );
    if (passMatch) {
      passThreshold = parseInt(passMatch[1]);
    }
    log(`Ngưỡng đỗ cho quiz này là: ${passThreshold}%`, "info");

    // Nếu điểm dưới ngưỡng đỗ, cần retry
    if (gradePercentage < passThreshold) {
      log(
        `Quiz không đạt yêu cầu (${gradePercentage}% < ${passThreshold}%). Cần làm lại.`,
        "warning"
      );

      // Thu thập các câu trả lời sai
      const collected = collectIncorrectAnswersFromResults();
      if (collected) {
        log("Đã thu thập các câu trả lời sai cho lần thử tiếp theo", "success");
      }

      // Tìm và click nút retry (thường là nút "Resume" hoặc tương tự trên trang kết quả)
      const retryButton = document.querySelector(
        'button[data-testid="CoverPageActionButton"], button:contains("Resume")' // Thêm selector chung
      );
      if (retryButton) {
        log("Đang click nút retry/resume trên trang kết quả...", "info");
        retryButton.click();

        // Xử lý dialog xác nhận "Start new attempt?" sau khi bấm retry
        setTimeout(() => {
          const continueButton = document.querySelector(
            '[data-testid="StartAttemptModal__primary-button"]'
          );
          if (continueButton) {
            log(
              "Đang click nút 'Continue' trong hộp thoại xác nhận 'Start new attempt'...",
              "info"
            );
            continueButton.click();
            // SAU KHI CLICK CONTINUE, CẦN GỌI LẠI processAllQuestions
            setTimeout(() => {
              log(
                "Đã click 'Continue', bắt đầu xử lý câu hỏi cho lần thử mới sau 3 giây.",
                "info"
              );
              processAllQuestions(); // Gọi lại để xử lý các câu hỏi của lượt mới
            }, 3000);
          } else {
            log(
              "Không tìm thấy nút 'Continue' trong hộp thoại xác nhận 'Start new attempt'.",
              "warning"
            );
            // Nếu không có dialog này, có thể trang đã tự chuyển sang quiz, thử gọi processAllQuestions
            setTimeout(() => {
              log(
                "Không có dialog 'Start new attempt', thử xử lý câu hỏi trực tiếp sau 3 giây.",
                "info"
              );
              processAllQuestions();
            }, 3000);
          }
        }, 1500); // Tăng nhẹ thời gian chờ dialog xác nhận

        return true; // Đã bắt đầu quá trình retry
      } else {
        log("Không tìm thấy nút retry/resume trên trang kết quả.", "warning");
      }
    } else {
      log(
        `Quiz đã đạt yêu cầu (${gradePercentage}% >= ${passThreshold}%). Không cần làm lại.`,
        "success"
      );
    }

    return false; // Không cần retry hoặc không thể retry
  }

  // --- Xử lý câu hỏi dạng trắc nghiệm (MCQ) ---
  async function processMCQQuestions() {
    // Xác định tất cả container của các câu hỏi MCQ
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_MultipleChoiceQuestion"]'
    );

    for (const container of questionContainers) {
      // Lấy prompt element chứa câu hỏi
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      log(
        "Đang xử lý câu hỏi MCQ: " + questionText.substring(0, 50) + "...",
        "info"
      );

      // Lấy container chứa các option
      const optionsContainer = container.querySelector('[role="radiogroup"]');
      if (!optionsContainer) {
        log("Không tìm thấy container đáp án (MCQ) cho câu hỏi", "warning");
        continue;
      }

      // Lấy tất cả các option
      const optionElements = Array.from(
        optionsContainer.querySelectorAll(".rc-Option")
      );

      // Nếu không tìm thấy option nào
      if (!optionElements.length) {
        log("Không tìm thấy đáp án nào cho câu hỏi (MCQ)", "warning");
        continue;
      }

      // Kiểm tra xem có đáp án nào đã được chọn chưa
      const alreadySelected = optionElements.some((option) =>
        option.querySelector('input[type="radio"]:checked')
      );

      if (alreadySelected) {
        log("Câu hỏi này đã được trả lời, bỏ qua", "info");
        continue;
      }

      // Xây dựng mảng options với format "A. Text"
      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      // Kiểm tra các đáp án đã biết là sai từ lần thử trước
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          log(
            `Đáp án ${getOptionLabel(
              index
            )} đã biết là sai: ${optionText.substring(0, 30)}...`,
            "warning"
          );
        }
      });

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        false
      );

      if (!answer) {
        log("Không nhận được đáp án từ Gemini cho câu hỏi (MCQ)", "error");
        continue;
      }

      // Kiểm tra nếu đáp án chỉ là một chữ cái (A, B, C, D, ...)
      const letterMatch = answer.match(/^([A-Z])(\.|$)/);
      if (letterMatch) {
        // Tìm option phù hợp với chữ cái
        const letter = letterMatch[1];
        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          // Kiểm tra xem đáp án này có đã biết là sai không
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            log(
              `Gemini đề xuất đáp án ${letter} nhưng đã biết là sai: ${optionText.substring(
                0,
                30
              )}...`,
              "warning"
            );

            // Chọn một option khác không thuộc danh sách sai
            const availableOptions = optionElements.filter(
              (_, index) => !incorrectOptionIndices.includes(index)
            );

            if (availableOptions.length > 0) {
              const fallbackOption = availableOptions[0];
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
              log(
                "Không có đáp án an toàn sau khi lọc các đáp án đã biết là sai",
                "error"
              );
            }
          } else {
            // Đáp án không thuộc danh sách sai, tiến hành chọn
            const input = optionToSelect.querySelector("input");
            if (input && !input.checked) {
              input.click();
              log(
                `Đã chọn đáp án ${letter}: ${optionText.substring(0, 30)}...`,
                "success"
              );
            }
          }
        } else {
          log(`Đáp án chữ cái không hợp lệ ${letter}`, "error");
        }
      } else {
        // Tìm option có nội dung gần nhất với đáp án
        let bestOption = null;
        let bestOptionIndex = -1;
        let bestOptionDistance = Infinity;

        optionElements.forEach((option, index) => {
          const optionText = getOptionText(option);

          // Bỏ qua nếu đáp án này đã biết là sai
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            log(
              `Bỏ qua đáp án đã biết là sai: ${optionText.substring(0, 30)}...`,
              "warning"
            );
            return;
          }

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
              )} (gần nhất với đáp án của Gemini): ${getOptionText(
                bestOption
              ).substring(0, 30)}...`,
              "success"
            );
          }
        } else {
          log(
            "Không tìm thấy đáp án phù hợp sau khi lọc các đáp án sai",
            "error"
          );

          // Nếu không tìm thấy đáp án phù hợp sau khi lọc, chọn đáp án đầu tiên không thuộc danh sách sai
          const safeOptions = optionElements.filter(
            (_, index) => !incorrectOptionIndices.includes(index)
          );
          if (safeOptions.length > 0) {
            const fallbackOption = safeOptions[0];
            const input = fallbackOption.querySelector("input");
            if (input && !input.checked) {
              input.click();
              log(
                `Đã chọn đáp án an toàn đầu tiên: ${getOptionText(
                  fallbackOption
                ).substring(0, 30)}...`,
                "info"
              );
            }
          }
        }
      }
    }
  }

  // --- Xử lý câu hỏi dạng checkbox (Multiple selection) ---
  async function processCheckboxQuestions() {
    // Xác định tất cả container của các câu hỏi Checkbox
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_CheckboxQuestion"]'
    );

    for (const container of questionContainers) {
      // Lấy prompt element chứa câu hỏi
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      log(
        "Đang xử lý câu hỏi Checkbox: " + questionText.substring(0, 50) + "...",
        "info"
      );

      // Lấy container chứa các option
      const optionsContainer = container.querySelector('[role="group"]');
      if (!optionsContainer) {
        log(
          "Không tìm thấy container đáp án (Checkbox) cho câu hỏi",
          "warning"
        );
        continue;
      }

      // Lấy tất cả các option
      const optionElements = Array.from(
        container.querySelectorAll(".rc-Option")
      );

      // Nếu không tìm thấy option nào
      if (!optionElements.length) {
        log("Không tìm thấy đáp án nào cho câu hỏi (Checkbox)", "warning");
        continue;
      }

      // Phát hiện số lượng lựa chọn cần chọn
      const requiredSelections = detectRequiredSelections(questionText);

      // Kiểm tra xem có đủ lựa chọn đã được chọn chưa
      const selectedCount = optionElements.filter((option) =>
        option.querySelector('input[type="checkbox"]:checked')
      ).length;

      if (selectedCount >= requiredSelections) {
        log(
          `Câu hỏi đã có ${selectedCount}/${requiredSelections} lựa chọn, bỏ qua`,
          "info"
        );
        continue;
      }

      // Xây dựng mảng options với format "A. Text"
      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      // Kiểm tra các đáp án đã biết là sai từ lần thử trước
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          log(
            `Đáp án ${getOptionLabel(
              index
            )} đã biết là sai: ${optionText.substring(0, 30)}...`,
            "warning"
          );
        }
      });

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        true
      );

      if (!answer) {
        log("Không nhận được đáp án từ Gemini cho câu hỏi (Checkbox)", "error");
        continue;
      }

      // Phân tích đáp án nhiều lựa chọn
      const selectedLetters = parseMultipleAnswers(answer);
      log(
        `Đã phân tích các đáp án được chọn: ${selectedLetters.join(", ")}`,
        "info"
      );

      if (selectedLetters.length === 0) {
        log(
          "Không thể phân tích được các lựa chọn từ câu trả lời của Gemini",
          "warning"
        );
        continue;
      }

      // Xóa tất cả các lựa chọn hiện tại
      optionElements.forEach((option) => {
        const checkbox = option.querySelector('input[type="checkbox"]:checked');
        if (checkbox) {
          checkbox.click();
          log(
            `Đã bỏ chọn đáp án: ${getOptionText(option).substring(0, 30)}...`,
            "info"
          );
        }
      });

      // Chọn các option theo đáp án
      let selectionCount = 0;

      // Đầu tiên xử lý các tùy chọn từ đáp án của Gemini
      for (const letter of selectedLetters) {
        if (selectionCount >= requiredSelections) break;

        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          // Kiểm tra xem đáp án này có đã biết là sai không
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            log(
              `Gemini đề xuất đáp án ${letter} nhưng đã biết là sai: ${optionText.substring(
                0,
                30
              )}...`,
              "warning"
            );
            continue;
          }

          // Đáp án không thuộc danh sách sai, tiến hành chọn
          const input = optionToSelect.querySelector("input[type='checkbox']");
          if (input && !input.checked) {
            input.click();
            log(
              `Đã chọn đáp án ${letter}: ${optionText.substring(0, 30)}...`,
              "success"
            );
            selectionCount++;
          }
        }
      }

      // Nếu vẫn chưa đủ lựa chọn, chọn thêm từ các tùy chọn an toàn
      if (selectionCount < requiredSelections) {
        const safeOptions = optionElements.filter((option, index) => {
          if (incorrectOptionIndices.includes(index)) return false;

          const letter = getOptionLabel(index);
          if (selectedLetters.includes(letter)) return false;

          const input = option.querySelector("input[type='checkbox']");
          return input && !input.checked;
        });

        for (const option of safeOptions) {
          if (selectionCount >= requiredSelections) break;

          const input = option.querySelector("input[type='checkbox']");
          if (input && !input.checked) {
            input.click();
            log(
              `Đã chọn thêm đáp án an toàn: ${getOptionText(option).substring(
                0,
                30
              )}...`,
              "info"
            );
            selectionCount++;
          }
        }
      }

      log(
        `Đã chọn ${selectionCount}/${requiredSelections} đáp án cho câu hỏi`,
        "info"
      );
    }
  }

  // --- Xử lý câu hỏi dạng điền đáp án (Text & Numeric) ---
  async function processInputQuestion(selector) {
    const containers = document.querySelectorAll(selector);

    for (const container of containers) {
      const prompt = container.querySelector(
        '[id^="prompt-autoGradableResponseId"]'
      );
      if (!prompt) continue;

      const questionText = prompt.textContent.trim();
      log(
        "Đang xử lý câu hỏi điền đáp án: " +
          questionText.substring(0, 50) +
          "...",
        "info"
      );

      const inputElement = container.querySelector(
        'input[type="text"], input[type="number"]'
      );

      if (!inputElement) {
        log("Không tìm thấy input cho câu hỏi", "warning");
        continue;
      }

      // Kiểm tra xem đã có giá trị hay chưa
      if (inputElement.value.trim()) {
        log("Input đã có giá trị, bỏ qua", "info");
        continue;
      }

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(questionText);

      if (!answer) {
        log("Không nhận được đáp án từ Gemini cho câu hỏi", "error");
        continue;
      }

      // Sử dụng setter của native input để cập nhật giá trị (hữu ích trong các ứng dụng React)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputElement, answer);
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      log(`Đã điền input với: ${answer}`, "success");
    }
  }

  // Hàm cải tiến để tìm và click nút submit một cách đáng tin cậy hơn
  function forceClickSubmitButton() {
    log("Đang tìm kiếm các nút submit...", "info");
    const allButtons = document.querySelectorAll("button");

    // Tìm và ghi log tất cả các nút có thể là nút submit
    for (const button of allButtons) {
      if (
        button.textContent.includes("Submit") ||
        button.getAttribute("aria-label") === "Submit" ||
        button.getAttribute("data-testid") === "submit-button"
      ) {
        const isDisabled =
          button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("cds-button-disabled");

        log(
          `Đã tìm thấy nút: ${button.textContent.trim()}, disabled: ${isDisabled}`,
          "info"
        );

        if (!isDisabled) {
          log("Đang cố gắng click nút submit...", "info");

          try {
            // Thử click chuẩn trước
            button.click();
            log("Đã thực hiện click chuẩn", "success");

            // Force-click như một bản backup
            const clickEvent = document.createEvent("MouseEvents");
            clickEvent.initEvent("click", true, true);
            button.dispatchEvent(clickEvent);
            log("Đã kích hoạt sự kiện click bắt buộc", "success");

            // Thử focus và sau đó click
            button.focus();
            setTimeout(() => button.click(), 100);
            log("Đã focus và click với độ trễ", "success");

            return true;
          } catch (error) {
            log(`Lỗi khi click nút: ${error}`, "error");
          }
        }
      }
    }

    // Thử các selector cụ thể
    const specificButtonSelectors = [
      '.css-hb4vw3 > button[data-testid="submit-button"]',
      'button.cds-button-primary[data-testid="submit-button"]',
      '.css-hb4vw3 button[aria-label="Submit"]',
    ];

    for (const selector of specificButtonSelectors) {
      const specificButton = document.querySelector(selector);
      if (specificButton) {
        log(`Đã tìm thấy nút submit bằng selector cụ thể: ${selector}`, "info");

        try {
          specificButton.click();
          log("Đã click nút submit cụ thể", "success");
          return true;
        } catch (error) {
          log(`Lỗi khi click nút với selector ${selector}: ${error}`, "error");
        }
      }
    }

    log("Không tìm thấy hoặc không thể click bất kỳ nút submit nào", "warning");
    return false;
  }

  // Hàm xử lý dialog "Ready to submit?"
  function handleReadyToSubmitDialog() {
    // Tìm nút submit trong dialog
    const dialogSubmitButton = document.querySelector(
      'button[data-testid="dialog-submit-button"]'
    );
    if (dialogSubmitButton) {
      log(
        "Đã tìm thấy dialog 'Ready to submit', đang click nút Submit...",
        "info"
      );
      try {
        dialogSubmitButton.click();
        log("Đã click nút 'Submit' trong dialog", "success");
        return true;
      } catch (error) {
        log(`Lỗi khi click nút submit trong dialog: ${error}`, "error");
      }
    }

    // Backup: tìm nút submit trong dialog dựa vào container và class
    const dialogSubmitButtonBackup = document.querySelector(
      ".css-6z6oep button.cds-button-primary"
    );
    if (dialogSubmitButtonBackup) {
      log("Đã tìm thấy nút submit trong dialog bằng selector backup", "info");
      try {
        dialogSubmitButtonBackup.click();
        log("Đã click nút submit trong dialog (backup)", "success");
        return true;
      } catch (error) {
        log(
          `Lỗi khi click nút submit trong dialog (backup): ${error}`,
          "error"
        );
      }
    }

    return false;
  }

  // Hàm chính để xử lý tất cả loại câu hỏi
  async function processAllQuestions() {
    try {
      // Kiểm tra xem có dialog "Ready to submit?" hoặc "Missing or invalid answers" không
      const missingAnswersDialogHeading = document.querySelector(
        "h2.css-tlf8h5" // Heading của dialog "Missing or invalid answers"
      );
      const readyToSubmitDialogHeading = document.querySelector(
        '[data-e2e="SubmitDialog__heading"]' // Heading của dialog "Ready to submit?"
      );

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
          log(
            "Đang click nút 'Cancel' để sửa các câu trả lời bị thiếu/sai.",
            "info"
          );
          cancelButton.click();
          // Đợi một chút rồi thử xử lý lại các câu hỏi
          setTimeout(() => {
            log("Thử xử lý lại các câu hỏi sau khi click Cancel.", "info");
            processAllQuestions();
          }, 2000);
          return; // Dừng xử lý hiện tại để quay lại sửa
        }
      } else if (readyToSubmitDialogHeading) {
        log("Đã tìm thấy dialog 'Ready to submit?'", "info");
        handleReadyToSubmitDialog();
        return; // Dừng xử lý hiện tại vì dialog submit sẽ được xử lý
      }

      // Kiểm tra xem có cần retry không
      if (checkAndRetryQuiz()) {
        log(
          "Đã bắt đầu làm lại quiz (thông qua checkAndRetryQuiz). Sẽ chờ checkAndRetryQuiz gọi lại processAllQuestions.",
          "warning"
        );
        return; // checkAndRetryQuiz sẽ tự gọi lại processAllQuestions nếu cần
      }

      // Kiểm tra và xử lý dialog xác nhận "Start new attempt?"
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
          log("Đã click nút 'Continue' trong dialog Start Attempt", "success");
          // Chờ trang load sau khi bấm Continue, rồi checkAndRetryQuiz hoặc processAllQuestions sẽ được gọi lại
          // Không return ngay, để vòng lặp chờ submit có cơ hội chạy nếu trang không reload
          setTimeout(() => {
            log(
              "Sau khi click 'Continue' trong StartAttemptModal, gọi lại processAllQuestions sau 3 giây.",
              "info"
            );
            processAllQuestions();
          }, 3000);
          return; // Đảm bảo không chạy tiếp phần xử lý câu hỏi của lượt cũ
        }
      }

      log("Bắt đầu xử lý các loại câu hỏi...", "info");
      // Xử lý câu hỏi MCQ
      await processMCQQuestions();
      log("Hoàn thành xử lý MCQ.", "info");

      // Xử lý câu hỏi Checkbox (Multiple selection)
      await processCheckboxQuestions();
      log("Hoàn thành xử lý Checkbox.", "info");

      // Xử lý câu hỏi điền đáp án
      await processInputQuestion(
        'div[data-testid="part-Submission_RegexQuestion"]'
      );
      await processInputQuestion(
        'div[data-testid="part-Submission_NumericQuestion"]'
      );
      log("Hoàn thành xử lý Input questions.", "info");

      await new Promise((resolve) => setTimeout(resolve, 1500));
      log("Đã chờ sau khi xử lý câu hỏi.", "info");

      // Ghi log thông tin debug cho các câu hỏi điền đáp án
      function debugFilledInputQuestions(selector, typeLabel) {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container, index) => {
          const prompt = container.querySelector(
            '[id^="prompt-autoGradableResponseId"]'
          );
          const inputElement = container.querySelector(
            'input[type="text"], input[type="number"]'
          );
          if (prompt && inputElement) {
            log(
              `[DEBUG ${typeLabel}][${index + 1}] Câu hỏi: "${prompt.textContent
                .trim()
                .substring(0, 50)}..."`,
              "info"
            );
            log(
              `[DEBUG ${typeLabel}][${index + 1}] Đáp án đã điền: "${
                inputElement.value
              }"`,
              "success"
            );
          }
        });
      }

      debugFilledInputQuestions(
        'div[data-testid="part-Submission_RegexQuestion"]',
        "Regex"
      );
      debugFilledInputQuestions(
        'div[data-testid="part-Submission_NumericQuestion"]',
        "Numeric"
      );

      // Tick vào ô đồng ý (Agreement checkbox)
      const agreementCheckbox = document.querySelector(
        'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
      );
      if (agreementCheckbox && !agreementCheckbox.checked) {
        agreementCheckbox.click();
        log("Đã tick vào ô đồng ý.", "success");
      } else if (!agreementCheckbox) {
        log("Không tìm thấy ô đồng ý.", "warning");
      } else {
        log("Ô đồng ý đã được tick từ trước.", "info");
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Click nút Submit ban đầu, với kiểm tra và chờ đợi nút submit được enable
      log("Đang tìm và chờ nút submit được enable...", "info");
      let submitButton = null;
      let attemptsToFindSubmit = 0;
      const maxAttemptsToFindSubmit = 10;

      while (attemptsToFindSubmit < maxAttemptsToFindSubmit) {
        submitButton = document.querySelector(
          'button[data-testid="submit-button"], .css-hb4vw3 > button[data-testid="submit-button"]'
        );
        if (submitButton && !submitButton.disabled) {
          log("Đã tìm thấy nút submit ENABLED.", "success");
          break;
        }
        if (submitButton && submitButton.disabled) {
          log(
            `Nút submit vẫn đang DISABLED. Chờ 1 giây... (Lần thử ${
              attemptsToFindSubmit + 1
            }/${maxAttemptsToFindSubmit})`,
            "info"
          );
        } else {
          log(
            `Không tìm thấy nút submit. Chờ 1 giây... (Lần thử ${
              attemptsToFindSubmit + 1
            }/${maxAttemptsToFindSubmit})`,
            "warning"
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attemptsToFindSubmit++;
      }

      if (submitButton && !submitButton.disabled) {
        log("Đang click nút submit...", "info");
        submitButton.click();
      } else {
        log(
          "Không thể click nút submit (không tìm thấy hoặc vẫn bị disabled sau khi chờ).",
          "error"
        );
      }

      // Sau 2-3 giây, check và xử lý dialog "Missing or invalid answers" hoặc "Ready to submit?"
      setTimeout(() => {
        const missingAnswersDialogAgain =
          document.querySelector("h2.css-tlf8h5");
        const readyToSubmitDialogAgain = document.querySelector(
          '[data-e2e="SubmitDialog__heading"]'
        );

        if (
          missingAnswersDialogAgain &&
          missingAnswersDialogAgain.textContent
            .trim()
            .toLowerCase()
            .includes("missing or invalid answers")
        ) {
          log(
            "Đã tìm thấy dialog 'Missing or invalid answers' (sau khi submit).",
            "warning"
          );
          const cancelButton = document.querySelector(
            'button[data-testid="dialog-cancel-button"]'
          );
          if (cancelButton) {
            log(
              "Đang click nút 'Cancel' để sửa các câu trả lời bị thiếu/sai.",
              "info"
            );
            cancelButton.click();
            setTimeout(() => {
              log(
                "Thử xử lý lại các câu hỏi sau khi click Cancel (lần 2).",
                "info"
              );
              processAllQuestions();
            }, 2000);
            return;
          }
        } else if (readyToSubmitDialogAgain) {
          log(
            "Đã tìm thấy dialog 'Ready to submit?' sau khi click submit chính.",
            "info"
          );
          handleReadyToSubmitDialog();
        } else {
          log(
            "Không tìm thấy dialog nào sau khi click submit chính. Có thể quiz đã submit thành công hoặc có lỗi khác.",
            "warning"
          );
          // Có thể cần kiểm tra kết quả ở đây hoặc đợi injectAutoQuizScript xử lý
        }
      }, 3000); // Tăng thời gian chờ dialog lên 3 giây
    } catch (error) {
      log(`Lỗi khi xử lý các câu hỏi: ${error}`, "error");
    }
  }

  // Inject script autoquiz
  async function injectAutoQuizScript() {
    log("Đang chạy script xử lý quiz...", "info");

    try {
      await processAllQuestions();
      log(
        "Tất cả câu hỏi đã được xử lý bởi processAllQuestions(). Bắt đầu kiểm tra hoàn thành.",
        "success"
      );
    } catch (error) {
      log(`Lỗi trong quá trình processAllQuestions: ${error}`, "error");
      processingQuiz = false;
      // Cân nhắc việc quay lại hoặc thử lại module thay vì chỉ dừng
      // window.history.back();
      // setTimeout(processCurrentModule, 3000);
      log(
        "Do lỗi, thử quay lại trang module và xử lý lại trong 3 giây...",
        "warning"
      );
      setTimeout(() => {
        if (
          currentModuleToProcess &&
          currentModuleToProcess.element &&
          document.body.contains(currentModuleToProcess.element)
        ) {
          currentModuleToProcess.element.click(); // Thử click lại vào module hiện tại
          setTimeout(startAutoQuiz, 3000); // Rồi bắt đầu lại
        } else {
          window.history.back(); // Fallback nếu không có currentModuleToProcess
          setTimeout(startAutoQuiz, 3000);
        }
      }, 3000);
      return;
    }

    const checkQuizCompletionInterval = setInterval(() => {
      const gradeElement = document.querySelector(
        'div[data-testid="AssignmentViewTopBanner"] h2.cds-Typography-base span.cds-Typography-base span, .css-14nrrh0, h2.cds-389 span > span' // Thêm selector cho grade mới
      );

      if (gradeElement) {
        const gradeText = gradeElement.textContent.trim();
        const gradePercentageMatch = gradeText.match(/(\d+(?:\.\d+)?)\s*%/);

        if (!gradePercentageMatch) {
          log(
            `Không thể trích xuất điểm phần trăm từ: "${gradeText}". Chờ thêm...`,
            "warning"
          );
          return;
        }
        const gradePercentage = parseFloat(gradePercentageMatch[1]);

        let passThreshold = 70;
        const passInfoElements = document.querySelectorAll(
          "div.css-f5oj6j span.css-kimdhf, .rc-BodyText p, .css-wo322s span.css-kimdhf" // Thêm selector cho pass info
        );
        let passInfoText = "";
        for (const el of passInfoElements) {
          const currentText = el.textContent.toLowerCase();
          if (
            currentText.includes("to pass you need at least") ||
            currentText.includes("need at least")
          ) {
            passInfoText = el.textContent;
            break;
          }
        }
        if (!passInfoText) {
          // Fallback to searching the whole body if specific elements not found
          passInfoText = document.body.textContent;
        }

        const passMatch = passInfoText.match(
          /(?:to pass you need at least|need at least)\s*(\d+)%/i
        );
        if (passMatch) {
          passThreshold = parseInt(passMatch[1]);
        }
        log(
          `Điểm quiz: ${gradePercentage}%, Ngưỡng đỗ: ${passThreshold}%`,
          "info"
        );

        const passed = gradePercentage >= passThreshold;
        clearInterval(checkQuizCompletionInterval);

        if (passed) {
          log(
            `Quiz ĐÃ ĐẠT với điểm: ${gradePercentage}% >= ${passThreshold}%`,
            "success"
          );
          processingQuiz = false;

          const backButton = document.querySelector(
            'button[aria-label="Back"][data-classname="TunnelVisionClose"], button._11oq37xd.rc-TunnelVisionClose'
          );

          if (backButton) {
            log("Đã tìm thấy nút 'Back', đang click...", "info");
            backButton.click();

            setTimeout(() => {
              log(
                "Đã click 'Back'. Đang tìm breadcrumb tên khóa học...",
                "info"
              );
              const courseNameBreadcrumb = document.querySelector(
                'a[data-track-component="item_nav_course_name"], a.cds-breadcrumbs-link[href*="/home/welcome"]'
              );

              if (courseNameBreadcrumb) {
                log(
                  `Đã tìm thấy breadcrumb tên khóa học ("${courseNameBreadcrumb.textContent.trim()}"), đang click...`,
                  "info"
                );
                courseNameBreadcrumb.click();
                setTimeout(() => {
                  log(
                    "Đã click breadcrumb tên khóa học. Gọi lại startAutoQuiz() sau 4 giây.",
                    "info"
                  );
                  startAutoQuiz();
                }, 4000);
              } else {
                log(
                  "Không tìm thấy breadcrumb tên khóa học. Thử navigateToNextModule().",
                  "error"
                );
                navigateToNextModule();
              }
            }, 3000);
          } else {
            log(
              "Không tìm thấy nút 'Back'. Thử navigateToNextModule() theo cách cũ.",
              "warning"
            );
            navigateToNextModule();
          }
        } else {
          log(
            `Quiz KHÔNG ĐẠT với điểm: ${gradePercentage}% < ${passThreshold}%.`,
            "error"
          );
          if (checkAndRetryQuiz()) {
            log(
              "Đã bắt đầu quá trình làm lại quiz (thông qua checkAndRetryQuiz).",
              "info"
            );
          } else {
            log(
              "Không thể làm lại quiz hoặc đã hết lượt. Quay lại module.",
              "warning"
            );
            window.history.back();
            processingQuiz = false;
            setTimeout(() => {
              log(
                "Thử xử lý lại module hiện tại sau khi quay lại từ quiz thất bại..."
              );
              startAutoQuiz(); // Gọi startAutoQuiz để nó tự xác định module và xử lý
            }, 3000);
          }
        }
      } else if (window.location.href.includes("/home/module/")) {
        log("Đã ở trang module. Dừng kiểm tra hoàn thành quiz này.", "info");
        clearInterval(checkQuizCompletionInterval);
        processingQuiz = false;
      }
    }, 3000);
  }

  // Xử lý module hiện tại: tìm tất cả các quiz cần làm và thực hiện
  function processCurrentModule() {
    if (processingQuiz || moduleProcessingComplete) return;

    // Kiểm tra xem có phải đang ở trang module không
    if (!window.location.href.includes("/home/module/")) {
      log("Không phải đang ở trang module, không thể xử lý!", "error");
      navigateToNextModule();
      return;
    }

    log("Bắt đầu xử lý module hiện tại...", "info");

    // Tìm các quiz có thể làm trong module hiện tại
    const quizzes = findAttemptableQuizzes();

    if (quizzes.length === 0) {
      log("Không tìm thấy quiz nào cần làm trong module này.", "warning");
      moduleProcessingComplete = true;
      navigateToNextModule();
      return;
    }

    // Bắt đầu làm quiz đầu tiên tìm được
    log(
      `Tìm thấy ${quizzes.length} quiz cần làm. Bắt đầu làm quiz đầu tiên...`,
      "success"
    );
    openAndStartQuiz(quizzes[0]);
  }

  // Di chuyển đến module tiếp theo
  function navigateToNextModule() {
    if (!allAvailableModules || allAvailableModules.length === 0) {
      log(
        "navigateToNextModule: Danh sách allAvailableModules rỗng. Thử tìm lại...",
        "warning"
      );
      allAvailableModules = findAllModules();
      if (!allAvailableModules || allAvailableModules.length === 0) {
        log(
          "Không có danh sách module nào để điều hướng sau khi thử lại.",
          "error"
        );
        currentModuleToProcess = null; // Đảm bảo reset nếu không còn module
        return;
      }
    }

    let nextModuleToProcess = null;
    // let newModuleUrl = null; // Không cần newModuleUrl nữa, sẽ dùng currentModuleToProcess.url

    if (currentModuleToProcess && currentModuleToProcess.url) {
      const currentIndex = allAvailableModules.findIndex(
        (m) => m.url === currentModuleToProcess.url
      );
      if (currentIndex !== -1) {
        if (currentIndex + 1 < allAvailableModules.length) {
          nextModuleToProcess = allAvailableModules[currentIndex + 1];
        } else {
          log(
            "Đã xử lý module cuối cùng hoặc không còn module nào.",
            "success"
          );
          currentModuleToProcess = null;
          processingQuiz = false;
          moduleProcessingComplete = true;
          return;
        }
      } else {
        log(
          `Module đang xử lý (${currentModuleToProcess.title}) không có trong danh sách. Thử module đầu tiên.`,
          "warning"
        );
        if (allAvailableModules.length > 0) {
          nextModuleToProcess = allAvailableModules[0];
        }
      }
    } else {
      log(
        "Không có module hiện tại làm tham chiếu. Thử điều hướng đến module đầu tiên.",
        "info"
      );
      if (allAvailableModules.length > 0) {
        nextModuleToProcess = allAvailableModules[0];
      }
    }

    if (nextModuleToProcess) {
      currentModuleToProcess = nextModuleToProcess;
      const targetUrl = currentModuleToProcess.url; // Lưu URL mục tiêu
      moduleProcessingComplete = false;
      processingQuiz = false;

      let navigationTriggeredByClick = false;
      if (
        currentModuleToProcess.element &&
        document.body.contains(currentModuleToProcess.element)
      ) {
        log(
          `Đang click để di chuyển đến module: ${currentModuleToProcess.title} (URL: ${targetUrl})`,
          "info"
        );
        currentModuleToProcess.element.click();
        navigationTriggeredByClick = true;
      } else {
        log(
          `Phần tử DOM cho module ${currentModuleToProcess.title} không tìm thấy hoặc không hợp lệ. Sử dụng URL fallback: ${targetUrl}`,
          "warning"
        );
        window.location.href = targetUrl;
        // Nếu dùng window.location.href, script sẽ dừng và cần chạy lại thủ công trên trang mới.
        // Không cần setTimeout trong trường hợp này.
      }

      if (navigationTriggeredByClick) {
        log(
          `Đã click để điều hướng. Chờ module mới load và gọi lại startAutoQuiz sau 5 giây...`
        );
        setTimeout(() => {
          log("Hết thời gian chờ, gọi lại startAutoQuiz để xử lý module mới.");
          startAutoQuiz(); // Gọi lại hàm chính để xử lý module mới
        }, 5000);
      }
      // Không cần else ở đây vì nếu là window.location.href, script sẽ dừng.
    } else {
      log(
        "Không tìm thấy module tiếp theo để điều hướng hoặc đã xử lý hết.",
        "success"
      );
      currentModuleToProcess = null;
    }
  }

  // Bắt đầu tự động làm quiz
  function startAutoQuiz() {
    log("Bắt đầu/Tiếp tục tự động làm quiz...", "info"); // Thay đổi log một chút

    // Luôn lấy lại danh sách module mỗi khi hàm này được gọi
    // Điều này quan trọng khi điều hướng giữa các trang module.
    allAvailableModules = findAllModules();

    if (allAvailableModules.length === 0) {
      if (
        window.location.href.includes("/assignment-submission/") ||
        window.location.href.includes("/quiz/")
      ) {
        log("Đang ở trang quiz/assignment. Chờ xử lý quiz hoàn tất...", "info");
      } else {
        log(
          "Không tìm thấy module nào trên trang này. Script có thể đã bị dừng hoặc trang không hợp lệ.",
          "error"
        );
      }
      return;
    }
    log(
      `Tìm thấy ${allAvailableModules.length} module có thể click.`,
      "success"
    );

    const currentActualUrl = window.location.href;
    let identifiedModuleAsCurrent = allAvailableModules.find((m) =>
      currentActualUrl.includes(m.url)
    );

    // Ưu tiên currentModuleToProcess đã được set bởi navigateToNextModule (nếu có)
    // Hoặc nếu không có, thì thử xác định module dựa trên URL hiện tại.
    if (
      currentModuleToProcess &&
      currentModuleToProcess.url &&
      currentActualUrl.includes(currentModuleToProcess.url)
    ) {
      // Đã ở đúng module được navigateToNextModule nhắm tới
      log(
        `Đã ở trang module đích: ${currentModuleToProcess.title}. Tiếp tục xử lý.`,
        "info"
      );
    } else if (identifiedModuleAsCurrent) {
      // Xác định module hiện tại dựa trên URL (ví dụ, khi script mới chạy hoặc refresh trang)
      currentModuleToProcess = identifiedModuleAsCurrent;
      log(
        `Xác định module hiện tại dựa trên URL: ${currentModuleToProcess.title}. Bắt đầu xử lý.`,
        "info"
      );
      moduleProcessingComplete = false;
      processingQuiz = false;
    } else if (allAvailableModules.length > 0 && !currentModuleToProcess) {
      // Không khớp URL nào, và chưa có module nào được set -> đi đến module đầu tiên
      log(
        "Không khớp module nào và chưa có module đang xử lý. Điều hướng đến module đầu tiên.",
        "info"
      );
      currentModuleToProcess = allAvailableModules[0];
      moduleProcessingComplete = false;
      processingQuiz = false;
      if (currentModuleToProcess.element) {
        log(
          `Click để điều hướng đến module đầu tiên: ${currentModuleToProcess.title}`,
          "info"
        );
        currentModuleToProcess.element.click();
      } else {
        window.location.href = currentModuleToProcess.url;
      }
      // Sau khi click, trang sẽ load lại và startAutoQuiz sẽ được gọi lại.
      return;
    } else if (!currentModuleToProcess && allAvailableModules.length === 0) {
      log("Không có module nào để xử lý.", "error");
      return;
    }

    // Nếu currentModuleToProcess đã được xác định (hoặc từ navigateToNextModule, hoặc từ URL)
    if (currentModuleToProcess && currentModuleToProcess.url) {
      // Chỉ gọi processCurrentModule nếu URL hiện tại thực sự khớp với module đang nhắm tới
      if (window.location.href.includes(currentModuleToProcess.url)) {
        processCurrentModule();
      } else {
        // Điều này không nên xảy ra nếu logic trên đúng, nhưng là một fallback.
        log(
          `URL (${window.location.href}) không khớp với module đang nhắm tới (${currentModuleToProcess.title}). Thử điều hướng lại.`,
          "warning"
        );
        if (currentModuleToProcess.element)
          currentModuleToProcess.element.click();
        else window.location.href = currentModuleToProcess.url;
      }
    } else {
      log("Không thể xác định module hiện tại để xử lý.", "error");
    }
  }

  // Bắt đầu tự động làm quiz
  startAutoQuiz();
})();
