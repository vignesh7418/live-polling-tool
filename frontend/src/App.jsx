import { useEffect, useMemo, useState } from "react";
import "./App.css";
const API_BASE_URL = "https://live-polling-tool-e1eb.onrender.com";

function App() {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [polls, setPolls] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState({});

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);
  const [votingPolls, setVotingPolls] = useState({});
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  // =========================
  // GET ALL POLLS
  // =========================
  const fetchPolls = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/polls`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch polls");
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setPolls(data);
      } else {
        setPolls([]);
      }
    } catch (error) {
      console.error("Fetch polls error:", error);
      setErrorMessage("Unable to load polls.");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // INITIAL LOAD + LIVE REFRESH
  // =========================
  useEffect(() => {
    fetchPolls();

    const interval = setInterval(() => {
      fetchPolls();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // =========================
  // OPTION HANDLERS
  // =========================
  const updateOption = (index, value) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    );
  };

  const addOption = () => {
    setOptions((current) => [...current, ""]);
  };

  const removeOption = (index) => {
    if (options.length <= 2) {
      return;
    }

    setOptions((current) =>
      current.filter((_, optionIndex) => optionIndex !== index)
    );
  };

  // =========================
  // CREATE POLL
  // =========================
  const handleCreatePoll = async (event) => {
    event.preventDefault();

    setStatusMessage("");
    setErrorMessage("");

    const cleanQuestion = question.trim();

    const cleanOptions = options
      .map((option) => option.trim())
      .filter((option) => option !== "");

    if (!cleanQuestion) {
      setErrorMessage("Please enter a question.");
      return;
    }

    if (cleanOptions.length < 2) {
      setErrorMessage("Please enter at least 2 options.");
      return;
    }

    setIsSubmittingPoll(true);

    try {
      const response = await fetch(`${API_BASE_URL}/polls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: cleanQuestion,
          options: cleanOptions,
        }),
      });

      const responseText = await response.text();

      console.log("Create poll status:", response.status);
      console.log("Create poll response:", responseText);

      if (!response.ok) {
        throw new Error(
          responseText || "Failed to create poll"
        );
      }

      setQuestion("");
      setOptions(["", ""]);
      setShowCreatePoll(false);

      setStatusMessage("Poll created successfully.");

      await fetchPolls();
    } catch (error) {
      console.error("Create poll error:", error);
      setErrorMessage(
        error.message || "Failed to create poll."
      );
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  // =========================
  // VOTE
  // =========================
  const handleVote = async (pollId) => {
    const selectedOption = selectedOptions[pollId];

    if (
      selectedOption === undefined ||
      selectedOption === null ||
      selectedOption === ""
    ) {
      setErrorMessage("Please select an option before voting.");
      return;
    }

    setStatusMessage("");
    setErrorMessage("");

    setVotingPolls((current) => ({
      ...current,
      [pollId]: true,
    }));

    try {
      console.log("Voting poll ID:", pollId);
      console.log(
        "Selected option index:",
        Number(selectedOption)
      );
      console.log("API URL:", API_BASE_URL);

      const response = await fetch(
        `${API_BASE_URL}/polls/${pollId}/vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            optionIndex: Number(selectedOption),
          }),
        }
      );

      // IMPORTANT:
      // Don't use response.json() here.
      // Backend may return empty response.
      const responseText = await response.text();

      console.log("Vote status:", response.status);
      console.log("Vote response:", responseText);

      if (!response.ok) {
        throw new Error(
          responseText || "Failed to submit vote"
        );
      }

      setStatusMessage("Vote submitted successfully.");

      // Refresh latest vote counts
      await fetchPolls();

      // Clear selected option
      setSelectedOptions((current) => {
        const updated = { ...current };
        delete updated[pollId];
        return updated;
      });
    } catch (error) {
      console.error("Vote error:", error);

      setErrorMessage(
        error.message || "Failed to submit vote."
      );
    } finally {
      setVotingPolls((current) => ({
        ...current,
        [pollId]: false,
      }));
    }
  };

  // =========================
  // SELECT OPTION
  // =========================
  const handleOptionSelect = (pollId, optionIndex) => {
    setSelectedOptions((current) => ({
      ...current,
      [pollId]: optionIndex,
    }));

    setStatusMessage("");
    setErrorMessage("");
  };

  // =========================
  // COPY SHARE LINK
  // =========================
  const copyShareLink = async (pollId) => {
    const shareUrl = `${window.location.origin}?poll=${pollId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);

      setStatusMessage("Poll link copied.");
      setErrorMessage("");
    } catch (error) {
      console.error("Copy link error:", error);

      setErrorMessage("Unable to copy poll link.");
    }
  };

  // =========================
  // TOTAL VOTES
  // =========================
  const getOptionVoteCount = (poll, optionIndex) => {
    if (!poll || !Array.isArray(poll.options)) {
      return 0;
    }

    if (!poll.votes || typeof poll.votes !== "object") {
      return 0;
    }

    const optionName = String(
      poll.options[optionIndex] ?? ""
    ).trim();

    const count = poll.votes[optionName];

    return Number(count ?? 0);
  };

  const getTotalVotes = (poll) => {
    if (!poll || !poll.votes) {
      return 0;
    }

    if (typeof poll.votes === "object") {
      return Object.values(poll.votes).reduce(
        (total, value) => total + Number(value || 0),
        0
      );
    }

    return 0;
  };

  const totalVotes = useMemo(() => {
    return polls.reduce(
      (total, poll) => total + getTotalVotes(poll),
      0
    );
  }, [polls]);

  // =========================
  // RENDER
  // =========================
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Live Polling</h1>
          <p>Create polls, share them and watch votes update live.</p>
        </div>

        <button
          className="create-button"
          onClick={() => {
            setShowCreatePoll(true);
            setStatusMessage("");
            setErrorMessage("");
          }}
        >
          + Create Poll
        </button>
      </header>

      {/* STATUS */}
      {statusMessage && (
        <div className="success-message">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      {/* CREATE POLL */}
      {showCreatePoll ? (
        <section className="create-poll">
          <div className="section-header">
            <div>
              <h2>Create a New Poll</h2>
              <p>Ask a question and add multiple choices.</p>
            </div>
          </div>

          <form onSubmit={handleCreatePoll}>
            <label>Question</label>

            <input
              type="text"
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              placeholder="Enter your question"
            />

            <label>Options</label>

            <div className="options-container">
              {options.map((option, index) => (
                <div className="option-row" key={index}>
                  <input
                    type="text"
                    value={option}
                    onChange={(event) =>
                      updateOption(
                        index,
                        event.target.value
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                  />

                  {options.length > 2 && (
                    <button
                      type="button"
                      className="remove-option"
                      onClick={() =>
                        removeOption(index)
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="add-option"
              onClick={addOption}
            >
              + Add Option
            </button>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setShowCreatePoll(false);
                  setQuestion("");
                  setOptions(["", ""]);
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="submit-button"
                disabled={isSubmittingPoll}
              >
                {isSubmittingPoll
                  ? "Creating..."
                  : "Create Poll"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="create-poll-closed">
          <div className="create-icon">＋</div>

          <h3>Create your own poll</h3>

          <p>
            Ask a question, collect votes and see the
            results update in real time.
          </p>

          <button
            className="create-button open-create-button"
            onClick={() => {
              setShowCreatePoll(true);
              setStatusMessage("");
              setErrorMessage("");
            }}
          >
            Create Poll
          </button>
        </section>
      )}

      {/* STATS */}
      <section className="stats">
        <div className="stat-card">
          <span>Total Polls</span>
          <strong>{polls.length}</strong>
        </div>

        <div className="stat-card">
          <span>Total Votes</span>
          <strong>{totalVotes}</strong>
        </div>

        <div className="stat-card">
          <span>Status</span>
          <strong className="live-status">
            ● Live
          </strong>
        </div>
      </section>

      {/* POLLS */}
      <section className="poll-section">
        <div className="section-title">
          <div>
            <h2>Active Polls</h2>
            <p>Vote and watch the results update automatically.</p>
          </div>

          <span className="refresh-label">
            Auto refresh: 4s
          </span>
        </div>

        {loading ? (
          <div className="empty-state">
            Loading polls...
          </div>
        ) : polls.length === 0 ? (
          <div className="empty-state">
            <h3>No polls yet</h3>
            <p>Create your first poll to get started.</p>
          </div>
        ) : (
          <div className="poll-list">
            {polls.map((poll, pollIndex) => {
              const pollId = String(
                poll._id || poll.id || pollIndex
              );

              return (
                <article
                  className="poll-card"
                  key={pollId}
                >
                  <div className="poll-card-header">
                    <div>
                      <span className="poll-number">
                        Poll #{pollIndex + 1}
                      </span>

                      <h3>{poll.question}</h3>
                    </div>

                    <span className="live-badge">
                      ● LIVE
                    </span>
                  </div>

                  <div className="poll-options">
                    {Array.isArray(poll.options) &&
                      poll.options.map(
                        (option, optionIndex) => {
                          const voteCount =
                            getOptionVoteCount(
                              poll,
                              optionIndex
                            );

                          const isSelected =
                            String(
                              selectedOptions[pollId]
                            ) ===
                            String(optionIndex);

                          return (
                            <label
                              className={`poll-option ${
                                isSelected
                                  ? "selected"
                                  : ""
                              }`}
                              key={optionIndex}
                            >
                              <input
                                type="radio"
                                name={`poll-${pollId}`}
                                value={optionIndex}
                                checked={isSelected}
                                onChange={() =>
                                  handleOptionSelect(
                                    pollId,
                                    optionIndex
                                  )
                                }
                              />

                              <span className="option-text">
                                {option}
                              </span>

                              <span className="vote-count">
                                {voteCount} vote
                                {voteCount === 1
                                  ? ""
                                  : "s"}
                              </span>
                            </label>
                          );
                        }
                      )}
                  </div>

                  <div className="poll-footer">
                    <span>
                      Total votes:{" "}
                      <strong>
                        {getTotalVotes(poll)}
                      </strong>
                    </span>

                    <div className="poll-actions">
                      <button
                        className="share-button"
                        onClick={() =>
                          copyShareLink(pollId)
                        }
                      >
                        Share
                      </button>

                      <button
                        className="vote-button"
                        onClick={() =>
                          handleVote(pollId)
                        }
                        disabled={Boolean(
                          votingPolls[pollId]
                        )}
                      >
                        {votingPolls[pollId]
                          ? "Voting..."
                          : "Vote"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;