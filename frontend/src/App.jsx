import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL =
  "https://live-polling-tool-e1eb.onrender.com";

// ===============================
// VOTER ID
// ===============================

const getVoterId = () => {
  let voterId = localStorage.getItem("live_poll_voter_id");

  if (!voterId) {
    voterId = crypto.randomUUID();
    localStorage.setItem("live_poll_voter_id", voterId);
  }

  return voterId;
};

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

  // ===============================
  // FETCH POLLS
  // ===============================

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
      setErrorMessage(
        "Unable to load polls. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // INITIAL LOAD + AUTO REFRESH
  // ===============================

  useEffect(() => {
    fetchPolls();

    const interval = setInterval(() => {
      fetchPolls();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // ===============================
  // UPDATE OPTION
  // ===============================

  const updateOption = (index, value) => {
    setOptions((currentOptions) =>
      currentOptions.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    );
  };

  // ===============================
  // ADD OPTION
  // ===============================

  const addOption = () => {
    setOptions((currentOptions) => [
      ...currentOptions,
      "",
    ]);
  };

  // ===============================
  // REMOVE OPTION
  // ===============================

  const removeOption = (index) => {
    if (options.length <= 2) {
      return;
    }

    setOptions((currentOptions) =>
      currentOptions.filter(
        (_, optionIndex) => optionIndex !== index
      )
    );
  };

  // ===============================
  // CREATE POLL
  // ===============================

  const handleCreatePoll = async (event) => {
    event.preventDefault();

    setStatusMessage("");
    setErrorMessage("");

    const cleanedQuestion = question.trim();

    const cleanedOptions = options
      .map((option) => option.trim())
      .filter((option) => option !== "");

    if (!cleanedQuestion) {
      setErrorMessage(
        "Please enter a poll question."
      );
      return;
    }

    if (cleanedOptions.length < 2) {
      setErrorMessage(
        "Please enter at least 2 options."
      );
      return;
    }

    setIsSubmittingPoll(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/polls`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: cleanedQuestion,
            options: cleanedOptions,
          }),
        }
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          responseText || "Failed to create poll"
        );
      }

      setQuestion("");
      setOptions(["", ""]);
      setShowCreatePoll(false);

      setStatusMessage(
        "Poll created successfully!"
      );

      await fetchPolls();

      setTimeout(() => {
        setStatusMessage("");
      }, 3000);
    } catch (error) {
      console.error(
        "Create poll error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Failed to create poll."
      );
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  // ===============================
  // SELECT OPTION
  // ===============================

  const handleOptionSelect = (
    pollId,
    optionIndex
  ) => {
    setSelectedOptions((current) => ({
      ...current,
      [pollId]: optionIndex,
    }));
  };

  // ===============================
  // VOTE
  // ===============================

  const handleVote = async (pollId) => {
    const selectedOption =
      selectedOptions[pollId];

    if (
      selectedOption === undefined ||
      selectedOption === null
    ) {
      setErrorMessage(
        "Please select an option before voting."
      );
      return;
    }

    setStatusMessage("");
    setErrorMessage("");

    setVotingPolls((current) => ({
      ...current,
      [pollId]: true,
    }));

    try {
      const response = await fetch(
        `${API_BASE_URL}/polls/${pollId}/vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            optionIndex: Number(selectedOption),
            voterId: getVoterId(),
          }),
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        let errorMessage =
          responseText ||
          "Failed to submit vote";

        try {
          const errorData =
            JSON.parse(responseText);

          if (errorData.error) {
            errorMessage =
              errorData.error;
          }

          if (errorData.message) {
            errorMessage =
              errorData.message;
          }
        } catch {
          // Keep original error message
        }

        throw new Error(errorMessage);
      }

      setStatusMessage(
        "Vote submitted successfully!"
      );

      await fetchPolls();

      setTimeout(() => {
        setStatusMessage("");
      }, 2500);
    } catch (error) {
      console.error(
        "Vote error:",
        error
      );

      setErrorMessage(
        error.message ||
          "Failed to submit vote."
      );
    } finally {
      setVotingPolls((current) => ({
        ...current,
        [pollId]: false,
      }));
    }
  };

  // ===============================
  // GET VOTE COUNT
  // ===============================

  const getOptionVoteCount = (
    poll,
    index
  ) => {
    if (!poll || !poll.votes) {
      return 0;
    }

    const optionName =
      poll.options?.[index];

    if (!optionName) {
      return 0;
    }

    return Number(
      poll.votes[optionName] || 0
    );
  };

  // ===============================
  // TOTAL VOTES
  // ===============================

  const getTotalVotes = (poll) => {
    if (!poll || !poll.votes) {
      return 0;
    }

    return Object.values(
      poll.votes
    ).reduce(
      (total, value) =>
        total + Number(value || 0),
      0
    );
  };

  // ===============================
  // VOTE PERCENTAGE
  // ===============================

  const getVotePercentage = (
    poll,
    index
  ) => {
    const totalVotesForPoll =
      getTotalVotes(poll);

    const voteCount =
      getOptionVoteCount(
        poll,
        index
      );

    if (totalVotesForPoll === 0) {
      return 0;
    }

    return Math.round(
      (voteCount /
        totalVotesForPoll) *
        100
    );
  };

  // ===============================
  // TOTAL VOTES
  // ===============================

  const totalVotes = useMemo(() => {
    return polls.reduce(
      (total, poll) =>
        total + getTotalVotes(poll),
      0
    );
  }, [polls]);

  return (
    <div className="app">

      {/* ===============================
          HEADER
      =============================== */}

      <header className="header">
        <div>
          <h1>Live Polling</h1>

          <p>
            Create polls, collect votes and
            watch results update in real time.
          </p>
        </div>
      </header>

      {/* ===============================
          SUCCESS MESSAGE
      =============================== */}

      {statusMessage && (
        <div className="success-message">
          {statusMessage}
        </div>
      )}

      {/* ===============================
          ERROR MESSAGE
      =============================== */}

      {errorMessage && (
        <div className="error-message">
          {errorMessage}
        </div>
      )}

      {/* ===============================
          CREATE POLL
      =============================== */}

      {showCreatePoll ? (
        <section className="create-poll">

          <div className="section-header">
            <div>
              <h2>Create a New Poll</h2>

              <p>
                Ask a question and add
                multiple options.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleCreatePoll}
          >

            <div className="form-group">
              <label>
                Poll Question
              </label>

              <input
                type="text"
                value={question}
                onChange={(event) =>
                  setQuestion(
                    event.target.value
                  )
                }
                placeholder="What is your favourite programming language?"
              />
            </div>

            <div className="form-group">

              <div className="options-header">
                <label>
                  Options
                </label>

                <span>
                  {options.length} options
                </span>
              </div>

              <div className="options-container">

                {options.map(
                  (option, index) => (
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
                        placeholder={`Option ${
                          index + 1
                        }`}
                      />

                      {options.length > 2 && (
                        <button
                          type="button"
                          className="remove-option"
                          onClick={() =>
                            removeOption(
                              index
                            )
                          }
                        >
                          ×
                        </button>
                      )}

                    </div>
                  )
                )}

              </div>

              <button
                type="button"
                className="add-option"
                onClick={addOption}
              >
                + Add Option
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
            +
          </div>

          <div>
            <h2>
              Create a Poll
            </h2>

            <p>
              Start a new poll and
              collect responses.
            </p>
          </div>

          <button
            className="open-create-button"
            onClick={() =>
              setShowCreatePoll(true)
            }
          >
            Create Poll
          </button>

        </section>
      )}

      {/* ===============================
          STATS
      =============================== */}

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

      {/* ===============================
          ACTIVE POLLS
      =============================== */}

      <section className="poll-section">

        <div className="section-header">

          <div>
            <h2 className="section-title">
              Active Polls
            </h2>

            <p>
              Vote and watch the
              results update
              automatically.
            </p>
          </div>

          <span className="refresh-label">
            Auto refresh: 15s
          </span>

        </div>

        {/* LOADING */}

        {loading ? (
          <div className="empty-state">

            <h3>
              Loading polls...
            </h3>

            <p>
              Please wait a moment.
            </p>

          </div>

        ) : polls.length === 0 ? (

          /* NO POLLS */

          <div className="empty-state">

            <h3>
              No polls available
            </h3>

            <p>
              Create your first poll
              to get started.
            </p>

          </div>

        ) : (

          /* POLL LIST */

          <div className="poll-list">

            {polls.map(
              (poll, pollIndex) => {

                const totalVotesForPoll =
                  getTotalVotes(poll);

                const pollId =
                  poll._id ||
                  poll.id;

                return (
                  <article
                    className="poll-card"
                    key={
                      pollId ||
                      pollIndex
                    }
                  >

                    <div className="poll-card-header">

                      <span className="poll-number">
                        Poll #
                        {pollIndex + 1}
                      </span>

                      <span className="live-badge">
                        ● LIVE
                      </span>

                    </div>

                    <h3>
                      {poll.question}
                    </h3>

                    {/* OPTIONS */}

                    <div className="poll-options">

                      {poll.options?.map(
                        (
                          option,
                          optionIndex
                        ) => {

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

                          return (
                            <label
                              className={`poll-option ${
                                selectedOptions[
                                  pollId
                                ] ===
                                optionIndex
                                  ? "selected"
                                  : ""
                              }`}
                              key={
                                optionIndex
                              }
                            >

                              <input
                                type="radio"
                                name={`poll-${pollId}`}
                                checked={
                                  selectedOptions[
                                    pollId
                                  ] ===
                                  optionIndex
                                }
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
                                {voteCount} votes ·{" "}
                                {percentage}%
                              </span>

                            </label>
                          );
                        }
                      )}

                    </div>

                    {/* FOOTER */}

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
                            handleVote(
                              pollId
                            )
                          }
                          disabled={
                            votingPolls[
                              pollId
                            ]
                          }
                        >
                          {votingPolls[
                            pollId
                          ]
                            ? "Voting..."
                            : "Vote"}
                        </button>

                      </div>

                    </div>

                  </article>
                );
              }
            )}

          </div>
        )}

      </section>

    </div>
  );
}

export default App;