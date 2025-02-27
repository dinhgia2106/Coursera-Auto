// Lấy tất cả các liên kết module từ menu điều hướng
const moduleLinks = document.querySelectorAll(
  '.css-y3t86r > li a[data-test="rc-WeekNavigationItem"]'
);

// Track các segment đã xử lý để tránh tái xử lý
const processedSegments = new Set();

// Hàm để đợi nội dung segment được tải
function waitForSegments() {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const segmentLists = document.querySelectorAll(
        '.rc-NamedItemListRefresh ul[data-testid="named-item-list-list"]'
      );
      if (segmentLists.length > 0) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout sau 10 giây nếu không tìm thấy segment
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 10000);
  });
}

// Hàm để đợi trang assignment được tải sau khi click
function waitForPageLoad() {
  return new Promise((resolve) => {
    setTimeout(resolve, 3000); // Đợi 3 giây cho trang tải
  });
}

// Hàm đợi cho một element xuất hiện
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Hàm để áp dụng script làm bài tự động
async function applyQuizScript() {
  // Data mẫu của các câu hỏi (sẽ được điền bởi người dùng)
  const quizData = [];

  // Hàm chuẩn hóa văn bản: loại bỏ khoảng trắng thừa và chuyển về chữ thường
  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
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

  // Lấy phần nội dung câu hỏi (nếu có định dạng đáp án như "A. ..." thì tách, nếu không thì toàn bộ)
  function getQuestionOnly(text_input) {
    if (/\n\s*[A-Z]\.\s+/.test(text_input)) {
      const parts = text_input.split(/\n\s*[A-Z]\.\s+/);
      return parts[0].trim();
    } else {
      return text_input.trim();
    }
  }

  // Dành cho MCQ: parse mapping đáp án (letter => answer text)
  function parseAnswerOptions(text_input) {
    const lines = text_input.split("\n");
    const mapping = {};
    const regex = /^([A-Z])\.\s*(.+)$/;
    lines.forEach((line) => {
      const match = line.match(regex);
      if (match) {
        mapping[match[1]] = match[2].trim();
      }
    });
    return mapping;
  }

  // Tìm data mẫu có nội dung câu hỏi gần nhất so với câu hỏi hiện tại
  function findBestMatch(questionText) {
    let bestMatchIndex = -1;
    let bestMatch = null;
    let bestDistance = Infinity;
    const normalizedQuestion = normalizeText(questionText);

    for (let i = 0; i < quizData.length; i++) {
      const item = quizData[i];
      const quizQuestion = normalizeText(getQuestionOnly(item.text_input));
      let distance = levenshtein(normalizedQuestion, quizQuestion);

      // Nếu một chuỗi chứa chuỗi kia thì đặt khoảng cách = 0
      if (
        normalizedQuestion.includes(quizQuestion) ||
        quizQuestion.includes(normalizedQuestion)
      ) {
        distance = 0;
      }
      console.log(
        "So sánh:",
        normalizedQuestion,
        "với",
        quizQuestion,
        "-> distance:",
        distance
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = item;
        bestMatchIndex = i;
      }
    }

    // Nếu tìm thấy best match, xóa câu hỏi đó khỏi quizData để tránh tái sử dụng
    if (bestMatchIndex !== -1) {
      quizData.splice(bestMatchIndex, 1);
    }

    return bestMatch;
  }

  // Dành cho MCQ: lấy text của một option (giả sử bên trong có thẻ chứa lớp 'rc-CML')
  function getOptionText(optionElement) {
    const textContainer = optionElement.querySelector(".rc-CML");
    return textContainer ? textContainer.innerText.trim() : "";
  }

  // --- Xử lý câu hỏi dạng trắc nghiệm (MCQ) ---
  const mcqPrompts = document.querySelectorAll(
    'div[id^="prompt-autoGradableResponseId"]'
  );
  mcqPrompts.forEach((prompt) => {
    // Loại bỏ những câu hỏi dạng điền đáp án (Regex, Numeric)
    if (
      prompt.closest('[data-testid="part-Submission_RegexQuestion"]') ||
      prompt.closest('[data-testid="part-Submission_NumericQuestion"]')
    ) {
      return;
    }
    const questionText = prompt.innerText.trim();
    console.log("Processing MCQ question:", questionText);

    const match = findBestMatch(questionText);
    if (match) {
      console.log("Best match found (MCQ):", match);

      // Lấy mapping đáp án, nếu có (dạng "A. ..." thì mapping sẽ có key)
      const answerMapping = parseAnswerOptions(match.text_input);
      const questionContainer = prompt.closest(".css-dqaucz");
      if (!questionContainer) {
        console.warn("Không tìm thấy container của câu hỏi (MCQ) cho:", prompt);
        return;
      }
      const optionsContainer = questionContainer.querySelector(
        '[role="radiogroup"], [role="group"]'
      );
      if (!optionsContainer) {
        console.warn(
          "Không tìm thấy container đáp án (MCQ) cho câu hỏi:",
          questionText
        );
        return;
      }

      const optionElements = optionsContainer.querySelectorAll(".rc-Option");

      // Nếu có mapping (MCQ theo dạng chữ A, B, C,...)
      if (Object.keys(answerMapping).length > 0) {
        // Nếu output có định dạng "B. ..." thì lấy chữ đầu tiên, ngược lại tách bằng khoảng trắng
        let answerLetters = [];
        const letterMatch = match.output.match(/^([A-Z])\.\s*(.+)$/);
        if (letterMatch) {
          answerLetters.push(letterMatch[1]);
        } else {
          answerLetters = match.output.split(" ");
        }

        answerLetters.forEach((letter) => {
          const expectedText = answerMapping[letter];
          if (!expectedText) {
            console.warn(
              "Không tìm thấy mapping cho chữ",
              letter,
              "trong quizData (MCQ):",
              match.text_input
            );
            return;
          }
          console.log("Expected answer for letter", letter, ":", expectedText);

          let bestOption = null;
          let bestOptionDistance = Infinity;
          optionElements.forEach((option) => {
            const optionText = getOptionText(option);
            const distance = levenshtein(
              normalizeText(optionText),
              normalizeText(expectedText)
            );
            console.log(
              "So sánh option (MCQ):",
              optionText,
              "với",
              expectedText,
              "-> distance:",
              distance
            );
            if (distance < bestOptionDistance) {
              bestOptionDistance = distance;
              bestOption = option;
            }
          });
          if (bestOption) {
            const input = bestOption.querySelector("input");
            if (input && !input.checked) {
              input.click();
              console.log(
                "Clicked option for letter",
                letter,
                "with text:",
                getOptionText(bestOption)
              );
            }
          } else {
            console.warn(
              "Không tìm thấy đáp án phù hợp cho chữ",
              letter,
              "trong câu hỏi (MCQ):",
              questionText
            );
          }
        });
      } else {
        // Xử lý dạng đáp án thuần (plain answer) hoặc true/false:
        const expectedAnswer = match.output.trim();
        console.log("Expected plain answer:", expectedAnswer);

        let bestOption = null;
        let bestOptionDistance = Infinity;
        optionElements.forEach((option) => {
          const optionText = getOptionText(option);
          const distance = levenshtein(
            normalizeText(optionText),
            normalizeText(expectedAnswer)
          );
          console.log(
            "So sánh option (plain text):",
            optionText,
            "với",
            expectedAnswer,
            "-> distance:",
            distance
          );
          if (distance < bestOptionDistance) {
            bestOptionDistance = distance;
            bestOption = option;
          }
        });
        if (bestOption) {
          const input = bestOption.querySelector("input");
          if (input && !input.checked) {
            input.click();
            console.log("Clicked option with text:", getOptionText(bestOption));
          }
        } else {
          console.warn(
            "Không tìm thấy đáp án phù hợp (plain text) cho câu hỏi:",
            questionText
          );
        }
      }
    } else {
      console.warn(
        "Không tìm thấy data phù hợp cho câu hỏi (MCQ):",
        questionText
      );
    }
  });

  // --- Xử lý câu hỏi dạng điền đáp án (Text & Numeric) ---
  function processInputQuestion(selector) {
    const containers = document.querySelectorAll(selector);
    containers.forEach((container) => {
      const prompt = container.querySelector(
        '[id^="prompt-autoGradableResponseId"]'
      );
      if (!prompt) return;
      const questionText = prompt.innerText.trim();
      console.log("Processing Input question:", questionText);

      const match = findBestMatch(questionText);
      if (match) {
        console.log("Best match found (Input):", match);
        const expectedAnswer = match.output; // Dùng trực tiếp output làm đáp án
        const inputElement = container.querySelector(
          'input[type="text"], input[type="number"]'
        );
        if (inputElement) {
          // Sử dụng setter của native input để cập nhật giá trị (hữu ích trong các ứng dụng React)
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          ).set;
          nativeInputValueSetter.call(inputElement, expectedAnswer);
          inputElement.dispatchEvent(new Event("input", { bubbles: true }));
          inputElement.dispatchEvent(new Event("change", { bubbles: true }));
          console.log("Filled input with:", expectedAnswer);
        } else {
          console.warn(
            "Không tìm thấy input cho câu hỏi (Input):",
            questionText
          );
        }
      } else {
        console.warn(
          "Không tìm thấy data phù hợp cho câu hỏi (Input):",
          questionText
        );
      }
    });
  }

  // Xử lý container Regex và Numeric
  processInputQuestion('div[data-testid="part-Submission_RegexQuestion"]');
  processInputQuestion('div[data-testid="part-Submission_NumericQuestion"]');

  // --- Sau khi xử lý xong, in ra thông tin debug cho các câu điền đáp án ---
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
        console.log(
          `[DEBUG ${typeLabel}][${
            index + 1
          }] Question: "${prompt.innerText.trim()}"`
        );
        console.log(
          `[DEBUG ${typeLabel}][${index + 1}] Filled answer: "${
            inputElement.value
          }"`
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

  // --- Bước 2: Tick vào ô đồng ý (Agreement checkbox) ---
  const agreementCheckbox = document.querySelector(
    'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
  );
  if (agreementCheckbox && !agreementCheckbox.checked) {
    agreementCheckbox.click();
    console.log("Agreement checkbox ticked.");
  } else {
    console.log("Agreement checkbox không tìm thấy hoặc đã được tick.");
  }

  // --- Bước 3: Click nút Submit ban đầu ---
  const submitButton = document.querySelector(
    'button[data-testid="submit-button"]'
  );
  if (submitButton) {
    submitButton.click();
    console.log("Submit button clicked.");
  } else {
    console.warn("Submit button không tìm thấy.");
  }

  // --- Bước 4: Sau 1 giây, click nút Submit trong hộp thoại xác nhận ---
  return new Promise((resolve) => {
    setTimeout(async () => {
      const dialogSubmitButton = document.querySelector(
        'button[data-testid="dialog-submit-button"]'
      );
      if (dialogSubmitButton) {
        dialogSubmitButton.click();
        console.log("Dialog Submit button clicked.");

        // Đợi thêm 3 giây sau khi submit để trang cập nhật trước khi quay lại
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.log("Dialog Submit button không tìm thấy.");
      }
      resolve();
    }, 1000);
  });
}

// Hàm xử lý bấm nút Start và áp dụng quiz script
async function handleStartAndQuiz() {
  // Tìm và bấm nút Start
  const startButton = await waitForElement(
    'button[data-testid="CoverPageActionButton"]'
  );
  if (startButton) {
    console.log("Tìm thấy nút Start, đang bấm...");
    startButton.click();

    // Đợi trang quiz tải
    await waitForPageLoad();

    // Áp dụng script làm bài tự động
    console.log("Đang áp dụng script làm bài...");
    await applyQuizScript();

    // Đợi thêm 2 giây sau khi làm xong bài
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Tìm và bấm vào link module trong breadcrumb để quay lại
    const breadcrumbLinks = document.querySelectorAll(
      'nav[aria-label="Primary breadcrumb"] a'
    );
    if (breadcrumbLinks.length >= 3) {
      const moduleLink = breadcrumbLinks[2]; // Vị trí 2 là link module
      console.log("Bấm vào link module:", moduleLink.textContent.trim());
      moduleLink.click();
    } else {
      console.warn(
        "Không tìm thấy đủ link trong breadcrumb để quay lại module. Sử dụng fallback..."
      );
      window.history.back(); // Fallback nếu không tìm thấy breadcrumb
    }

    // Đợi trang module tải lại
    await waitForPageLoad();
    console.log("Trang module đã tải xong.");
    await waitForSegments();
    console.log("Các segment đã được tải.");

    return true;
  } else {
    console.log(
      "Không tìm thấy nút Start, có thể không phải trang bài tập hoặc đã làm rồi."
    );
    // Tương tự, quay lại bằng breadcrumb
    const breadcrumbLinks = document.querySelectorAll(
      'nav[aria-label="Primary breadcrumb"] a'
    );
    if (breadcrumbLinks.length >= 3) {
      const moduleLink = breadcrumbLinks[2];
      console.log("Bấm vào link module:", moduleLink.textContent.trim());
      moduleLink.click();
    } else {
      console.warn(
        "Không tìm thấy đủ link trong breadcrumb để quay lại module. Sử dụng fallback..."
      );
      window.history.back();
    }
    await waitForPageLoad();
    await waitForSegments();
    return false;
  }
}

// Hàm để trích xuất, in thông tin và kiểm tra các segment cần click
async function processSegments(moduleName) {
  const segmentLists = document.querySelectorAll(
    '.rc-NamedItemListRefresh ul[data-testid="named-item-list-list"]'
  );

  if (segmentLists.length > 0) {
    for (let listIndex = 0; listIndex < segmentLists.length; listIndex++) {
      const segmentList = segmentLists[listIndex];
      const segments = segmentList.querySelectorAll("li");

      for (let segIndex = 0; segIndex < segments.length; segIndex++) {
        const segment = segments[segIndex];

        // Tạo ID duy nhất cho segment này để track
        const segmentId = `${moduleName}_${listIndex}_${segIndex}`;

        // Bỏ qua nếu segment này đã xử lý
        if (processedSegments.has(segmentId)) {
          continue;
        }

        // Lấy tên segment
        const segmentName =
          segment
            .querySelector('p[data-test="rc-ItemName"]')
            ?.textContent.trim() || "Unnamed Segment";

        // Lấy loại segment
        let segmentType = "Unknown";
        const typeElement = segment.querySelector(".css-cgu8ti");
        if (typeElement) {
          segmentType = typeElement.textContent.trim();
        }

        // Kiểm tra trạng thái hoàn thành
        let status = "Not started";
        const statusElement = segment.querySelector('svg[role="img"]');
        if (statusElement) {
          const title = statusElement.querySelector("title");
          if (title && title.textContent.trim() === "Completed") {
            status = "Completed";
          }
        } else {
          const annotation = segment.querySelector(".rc-WeekItemAnnotations");
          if (annotation) {
            const text = annotation.textContent.trim();
            if (text.includes("Completed")) {
              status = "Completed";
            } else if (text.includes("Started")) {
              status = "Started";
            }
          }
        }

        // In ra thông tin segment
        console.log(
          `  Segment ${
            segIndex + 1
          }: ${segmentName} - Type: ${segmentType} - Status: ${status}`
        );

        // Kiểm tra xem có phải là Practice Assignment hoặc Graded Assignment và chưa hoàn thành không
        if (
          (segmentType.includes("Practice Assignment") ||
            segmentType.includes("Graded Assignment")) &&
          status !== "Completed"
        ) {
          console.log(`  --> Bấm vào assignment: ${segmentName}`);

          // Tìm thẻ a để click
          const assignmentLink = segment.querySelector("a");
          if (assignmentLink) {
            // Đánh dấu segment này đã được xử lý
            processedSegments.add(segmentId);

            // Click vào assignment
            assignmentLink.click();

            // Đợi trang assignment tải và xử lý
            await waitForPageLoad();

            // Bấm nút Start và làm bài quiz
            const completed = await handleStartAndQuiz();

            if (completed) {
              console.log(`  --> Đã hoàn thành assignment: ${segmentName}`);
            } else {
              console.log(
                `  --> Không thể hoàn thành assignment: ${segmentName}`
              );
            }
          }
        }
      }
    }
  } else {
    console.log("  Không tìm thấy segment nào cho module này.");
  }
}

// Hàm chính để xử lý tất cả các module
async function processModules() {
  console.log("Bắt đầu xử lý các module...");

  for (let i = 0; i < moduleLinks.length; i++) {
    const moduleLink = moduleLinks[i];
    const moduleName =
      moduleLink.querySelector(".css-xkyeje")?.textContent.trim() ||
      `Module ${i + 1}`;

    console.log(`Module: ${moduleName} (${i + 1}/${moduleLinks.length})`);

    // Bấm vào module
    moduleLink.click();

    // Đợi nội dung segment được tải
    await waitForSegments();

    // Xử lý các segment trong module
    await processSegments(moduleName);

    // Đợi 2 giây trước khi chuyển sang module tiếp theo
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("Đã xử lý xong tất cả các module!");
  console.log(
    "Tất cả các Practice Assignment và Graded Assignment chưa hoàn thành đã được truy cập và làm."
  );
}

// Chạy hàm chính
processModules();
