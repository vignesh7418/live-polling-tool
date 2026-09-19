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
  // FETCH POLLS
  // =========================
  const fetchPolls = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/polls`);

      if (!response.ok) {
        throw new Error("Failed to fetch polls");
      }

      const data = await response.json();

      setPolls(Array.isArray(data) ? data : []);
      setErrorMessage("");
    } catch (error) {
      console.error("Fetch polls error:", error);
      setErrorMessage("Failed to fetch polls. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // AUTO REFRESH
  // =========================
  useEffect(() => {
    fetchPolls();

    const interval = setInterval(() => {
      fetchPolls();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // =========================
  // UPDATE OPTION
  // =========================
  const updateOption = (index, value) => {
    const updatedOptions = [...options];
    updatedOptions[index] = value;
    setOptions(updatedOptions);
  };

  // =========================
  // ADD OPTION
  // =========================
  const addOption = () => {
    if (options.length >= 6) {
      setErrorMessage("Maximum 6 options allowed.");
      return;
    }

    setOptions([...options, ""]);
    setErrorMessage("");
  };

  // =========================
  // REMOVE OPTION
  // =========================
  const removeOption = (index) => {
    if (options.length <= 2) {
      setErrorMessage("At least 2 options are required.");
      return;
    }

    const updatedOptions = options.filter(
      (_, optionIndex) => optionIndex !== index
    );

    setOptions(updatedOptions);
    setErrorMessage("");
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
      setErrorMessage("Please enter a poll question.");
      return;
    }

    if (cleanOptions.length < 2) {
      setErrorMessage("Please enter at least 2 options.");
      return;
    }

    const uniqueOptions = [
      ...new Set(cleanOptions.map((option) => option.toLowerCase())),
    ];

    if (uniqueOptions.length !== cleanOptions.length) {
      setErrorMessage("Options must be unique.");
      return;
    }

    try {
      setIsSubmittingPoll(true);

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

      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to create poll");
      }

      setQuestion("");
      setOptions(["", ""]);
      setShowCreatePoll(false);

      setStatusMessage("Poll created successfully!");

      await fetchPolls();
    } catch (error) {
      console.error("Create poll error:", error);
      setErrorMessage(error.message || "Failed to create poll.");
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  // =========================
  // SELECT OPTION
  // =========================
  const handleOptionSelect = (pollId, optionIndex) => {
    setSelectedOptions((previous) => ({
      ...previous,
      [pollId]: optionIndex,
    }));
  };

  // =========================
  // VOTE
  // =========================
  const handleVote = async (pollId) => {
    setStatusMessage("");
    setErrorMessage("");

    const selectedOption = selectedOptions[pollId];

    if (
      selectedOption === undefined ||
      selectedOption === null ||
      selectedOption === ""
    ) {
      setErrorMessage("Please select an option before voting.");
      return;
    }

    try {
      setVotingPolls((previous) => ({
        ...previous,
        [pollId]: true,
      }));

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

      const responseText = await response.text();

      let data = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit vote");
      }

      setStatusMessage("Vote submitted successfully!");

      await fetchPolls();
    } catch (error) {
      console.error("Vote error:", error);
      setErrorMessage(error.message || "Failed to submit vote.");
    } finally {
      setVotingPolls((previous) => ({
        ...previous,
        [pollId]: false,
      }));
    }
  };

  // =========================
  // GET OPTION VOTE COUNT
  // =========================
  const getOptionVoteCount = (poll, index) => {
    if (!poll?.votes) {
      return 0;
    }

    if (Array.isArray(poll.votes)) {
      return Number(poll.votes[index] || 0);
    }

    if (typeof poll.votes === "object") {
      const optionName = poll.options?.[index];

      return Number(
        poll.votes[optionName] ??
          poll.votes[String(index)] ??
          0
      );
    }

    return 0;
  };

  // =========================
  // TOTAL VOTES
  // =========================
  const getTotalVotes = (poll) => {
    if (!poll) {
      return 0;
    }

    if (Array.isArray(poll.votes)) {
      return poll.votes.reduce(
        (total, vote) => total + Number(vote || 0),
        0
      );
    }

    if (typeof poll.votes === "object" && poll.votes !== null) {
      return Object.values(poll.votes).reduce(
        (total, vote) => total + Number(vote || 0),
        0
      );
    }

    return 0;
  };

  // =========================
  // VOTE PERCENTAGE
  // =========================
  const getVotePercentage = (poll, index) => {
    const totalVotesForPoll = getTotalVotes(poll);
    const voteCount = getOptionVoteCount(poll, index);

    if (totalVotesForPoll === 0) {
      return 0;
    }

    return Math.round(
      (voteCount / totalVotesForPoll) * 100
    );
  };

  // =========================
  // TOTAL VOTES - ALL POLLS
  // =========================
  const totalVotes = useMemo(() => {
    return polls.reduce(
      (total, poll) => total + getTotalVotes(poll),
      0
    );
  }, [polls]);

  return (
    <div className="app">

      {/* ================= HEADER ================= */}
      <header className="header">
        <div>
          <h1>Live Polling</h1>

          <p>
            Create polls, collect votes and watch results update live.
          </p>
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

      {/* ================= MESSAGES ================= */}
      {statusMessage && (
        <div className="success-message">
          ✓ {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="error-message">
          ⚠ {errorMessage}
        </div>
      )}

      {/* ================= CREATE POLL ================= */}
      {showCreatePoll ? (
        <section className="create-poll">

          <div className="section-header">
            <div>
              <h2>Create a new poll</h2>

              <p>
                Ask a question and add at least two options.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreatePoll}>

            <div className="form-group">

              <label>Question</label>

              <input
                type="text"
                value={question}
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
                placeholder="What is your favourite programming language?"
                maxLength={200}
              />

            </div>

            <div className="form-group">

              <div className="options-header">

                <label>Options</label>

                <span>
                  {options.length}/6
                </span>

              </div>

              <div className="options-container">

                {options.map((option, index) => (
                  <div
                    className="option-row"
                    key={index}
                  >

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
                      maxLength={100}
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
                + Add option
              </button>

            </div>

            <div className="form-actions">

              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setShowCreatePoll(false);
                  setQuestion("");
                  setOptions(["", ""]);
                  setErrorMessage("");
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

          <div className="create-icon">
            ＋
          </div>

          <div>
            <h2>Create a poll</h2>

            <p>
              Start a new live poll and collect responses.
            </p>
          </div>

          <button
            className="open-create-button"
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

      {/* ================= STATS ================= */}
      <section className="stats">

        <div className="stat-card">

          <span className="stat-label">
            Total Polls
          </span>

          <strong>
            {polls.length}
          </strong>

        </div>

        <div className="stat-card">

          <span className="stat-label">
            Total Votes
          </span>

          <strong>
            {totalVotes}
          </strong>

        </div>

        <div className="stat-card">

          <span className="stat-label">
            Status
          </span>

          <strong className="live-status">
            ● Live
          </strong>

        </div>

      </section>

      {/* ================= ACTIVE POLLS ================= */}
      <section className="poll-section">

        <div className="section-header">

          <div>

            <h2 className="section-title">
              Active Polls
            </h2>

            <p>
              Vote and watch the results update automatically.
            </p>

          </div>

          <span className="refresh-label">
            Auto refresh: 4s
          </span>

        </div>

        {loading ? (

          <div className="empty-state">

            <h3>
              Loading polls...
            </h3>

            <p>
              Please wait while we fetch the latest polls.
            </p>

          </div>

        ) : polls.length === 0 ? (

          <div className="empty-state">

            <h3>
              No polls available
            </h3>

            <p>
              Create your first poll to get started.
            </p>

          </div>

        ) : (

          <div className="poll-list">

            {polls.map((poll, pollIndex) => {

              const totalVotesForPoll =
                getTotalVotes(poll);

              const isVoting =
                votingPolls[poll._id];

              return (

                <article
                  className="poll-card"
                  key={poll._id}
                >

                  {/* Poll Header */}
                  <div className="poll-card-header">

                    <span className="poll-number">
                      Poll #{pollIndex + 1}
                    </span>

                    <span className="live-badge">
                      ● LIVE
                    </span>

                  </div>

                  {/* Question */}
                  <h3>
                    {poll.question}
                  </h3>

                  {/* Options */}
                  <div className="poll-options">

                    {poll.options?.map(
                      (option, optionIndex) => {

                        const voteCount =
                          getOptionVoteCount(
                            poll,
                            optionIndex
                          );

                        const percentage =
                          getVotePercentage(
                            poll,
                            optionIndex
                          );

                        const isSelected =
                          Number(
                            selectedOptions[poll._id]
                          ) === optionIndex;

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
                              name={`poll-${poll._id}`}
                              value={optionIndex}
                              checked={isSelected}
                              onChange={() =>
                                handleOptionSelect(
                                  poll._id,
                                  optionIndex
                                )
                              }
                            />

                            <span className="option-text">
                              {option}
                            </span>

                            <span className="vote-count">
                              {voteCount} votes · {percentage}%
                            </span>

                          </label>

                        );
                      }
                    )}

                  </div>

                  {/* Footer */}
                  <div className="poll-footer">

                    <span>
                      Total votes:{" "}
                      <strong>
                        {totalVotesForPoll}
                      </strong>
                    </span>

                    <div className="poll-actions">

                      <button
                        className="vote-button"
                        onClick={() =>
                          handleVote(poll._id)
                        }
                        disabled={isVoting}
                      >
                        {isVoting
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