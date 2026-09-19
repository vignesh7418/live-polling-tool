import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:8080";

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

  // Create Poll form open / close
  const [showCreatePoll, setShowCreatePoll] = useState(false);

  const totalPollVotes = useMemo(() => {
    return polls.reduce((sum, poll) => sum + getTotalVotes(poll), 0);
  }, [polls]);

  // =========================
  // FETCH POLLS
  // =========================
  const fetchPolls = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/polls`);

      if (!response.ok) {
        throw new Error("Unable to load polls from the backend.");
      }

      const data = await response.json();

      setPolls(Array.isArray(data) ? data : []);
      setErrorMessage("");
    } catch (error) {
      console.error("Failed to fetch polls:", error);

      setErrorMessage(
        error.message || "Failed to fetch polls."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // LOAD POLLS + LIVE REFRESH
  // =========================
  useEffect(() => {
    fetchPolls();

    const refreshInterval = window.setInterval(() => {
      fetchPolls({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, []);

  // =========================
  // ADD OPTION
  // =========================
  const addOption = () => {
    setOptions((currentOptions) => {
      return [...currentOptions, ""];
    });
  };

  // =========================
  // REMOVE OPTION
  // =========================
  const removeOption = (index) => {
    setOptions((currentOptions) => {
      if (currentOptions.length <= 2) {
        return currentOptions;
      }

      return currentOptions.filter(
        (_, optionIndex) => optionIndex !== index
      );
    });
  };

  // =========================
  // UPDATE OPTION
  // =========================
  const updateOption = (index, value) => {
    setOptions((currentOptions) => {
      const updatedOptions = [...currentOptions];

      updatedOptions[index] = value;

      return updatedOptions;
    });
  };

  // =========================
  // CLEAR MESSAGES
  // =========================
  const clearFeedback = () => {
    setStatusMessage("");
    setErrorMessage("");
  };

  // =========================
  // CREATE POLL
  // =========================
  const createPoll = async (event) => {
    event.preventDefault();

    clearFeedback();

    const trimmedQuestion = question.trim();

    const trimmedOptions = options
      .map((option) => option.trim())
      .filter(Boolean);

    if (!trimmedQuestion) {
      setErrorMessage("Please enter a poll question.");
      return;
    }

    if (trimmedOptions.length < 2) {
      setErrorMessage("Add at least two valid poll options.");
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
          question: trimmedQuestion,
          options: trimmedOptions,
        }),
      });

      const responseData = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          responseData.error || "Poll creation failed."
        );
      }

      // Clear form
      setQuestion("");
      setOptions(["", ""]);

      // Close create poll form
      setShowCreatePoll(false);

      setStatusMessage(
        "Poll created successfully."
      );

      await fetchPolls({ silent: true });
    } catch (error) {
      console.error("Create poll error:", error);

      setErrorMessage(
        error.message || "Unable to create this poll."
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

    if (!selectedOption) {
      setErrorMessage(
        "Select one option before submitting your vote."
      );

      return;
    }

    setVotingPolls((current) => ({
      ...current,
      [pollId]: true,
    }));

    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/polls/${pollId}/vote`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            option: selectedOption,
          }),
        }
      );

      const responseData = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            "Unable to submit vote."
        );
      }

      setSelectedOptions((current) => ({
        ...current,
        [pollId]: "",
      }));

      setStatusMessage(
        `Vote submitted for "${selectedOption}".`
      );

      await fetchPolls({ silent: true });
    } catch (error) {
      console.error("Vote error:", error);

      setErrorMessage(
        error.message || "Unable to submit vote."
      );

      await fetchPolls({ silent: true });
    } finally {
      setVotingPolls((current) => ({
        ...current,
        [pollId]: false,
      }));
    }
  };

  // =========================
  // COPY SHARE LINK
  // =========================
  const copyShareLink = async (pollId) => {
    const shareUrl =
      `${window.location.origin}` +
      `${window.location.pathname}?poll=${pollId}`;

    try {
      await navigator.clipboard.writeText(
        shareUrl
      );

      setErrorMessage("");

      setStatusMessage(
        "Share link copied to your clipboard."
      );
    } catch (error) {
      console.error(
        "Clipboard copy failed:",
        error
      );

      setErrorMessage(
        "Clipboard access is unavailable. Copy the URL manually."
      );
    }
  };

  // =========================
  // HIGHLIGHT SHARED POLL
  // =========================
  const highlightPollId =
    new URLSearchParams(
      window.location.search
    ).get("poll");

  return (
    <div className="app-shell">

      {/* =========================
          HEADER
      ========================= */}

      <header className="topbar panel">

        <div className="brand-block">

          <div className="brand-mark">
            LP
          </div>

          <div>

            <p className="eyebrow">
              Realtime Engagement
            </p>

            <h1>
              Live Polling
            </h1>

          </div>

        </div>

        <p className="topbar-text">
          Create interactive polls, gather instant
          feedback, and watch results update in
          real time.
        </p>

      </header>


      {/* =========================
          DASHBOARD
      ========================= */}

      <main className="dashboard-layout">

        {/* =========================
            CREATE POLL
        ========================= */}

        <section className="panel create-panel">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                Create Poll
              </p>

              <h2>
                Launch a new question
              </h2>

            </div>

            <span className="pill">
              Live
            </span>

          </div>


          {/* =========================
              CREATE POLL CLOSED
          ========================= */}

          {!showCreatePoll ? (

            <div className="create-poll-closed">

              <div className="create-icon">
                +
              </div>

              <h3>
                Create a new poll
              </h3>

              <p>
                Ask a question and collect instant
                responses from your audience.
              </p>

              <button
                type="button"
                className="primary-button open-create-button"
                onClick={() =>
                  setShowCreatePoll(true)
                }
              >
                + Create Poll
              </button>

            </div>

          ) : (

            /* =========================
                CREATE POLL FORM
            ========================= */

            <form
              className="poll-form"
              onSubmit={createPoll}
            >

              {/* QUESTION */}

              <label className="field-group">

                <span className="field-label">
                  Question
                </span>

                <input
                  type="text"
                  value={question}
                  placeholder="What should we prioritize next?"
                  onChange={(event) =>
                    setQuestion(
                      event.target.value
                    )
                  }
                />

              </label>


              {/* OPTIONS */}

              <div className="field-group">

                <span className="field-label">
                  Options
                </span>

                <div className="option-list">

                  {options.map(
                    (option, index) => (

                      <div
                        className="option-row"
                        key={index}
                      >

                        <input
                          type="text"
                          value={option}
                          placeholder={
                            `Option ${index + 1}`
                          }
                          onChange={(event) =>
                            updateOption(
                              index,
                              event.target.value
                            )
                          }
                        />

                        <button
                          type="button"
                          className="ghost-button remove-button"
                          onClick={() =>
                            removeOption(index)
                          }
                          disabled={
                            options.length <= 2
                          }
                        >
                          Remove
                        </button>

                      </div>

                    )
                  )}

                </div>

              </div>


              {/* FORM BUTTONS */}

              <div className="form-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={addOption}
                >
                  + Add Option
                </button>


                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    isSubmittingPoll
                  }
                >
                  {isSubmittingPoll
                    ? "Creating..."
                    : "Create Poll"}
                </button>


                <button
                  type="button"
                  className="secondary-button cancel-button"
                  onClick={() => {
                    setShowCreatePoll(false);
                    setQuestion("");
                    setOptions(["", ""]);
                    clearFeedback();
                  }}
                >
                  Cancel
                </button>

              </div>

            </form>

          )}

        </section>


        {/* =========================
            STATISTICS
        ========================= */}

        <section className="panel stats-panel">

          <div className="section-heading compact">

            <div>

              <p className="eyebrow">
                Overview
              </p>

              <h2>
                Performance
              </h2>

            </div>

          </div>


          <div className="stat-grid">

            <div className="stat-card">

              <span>
                Total polls
              </span>

              <strong>
                {polls.length}
              </strong>

            </div>


            <div className="stat-card">

              <span>
                Total votes
              </span>

              <strong>
                {totalPollVotes}
              </strong>

            </div>


            <div className="stat-card">

              <span>
                Status
              </span>

              <strong className="live-indicator">
                Live
              </strong>

            </div>

          </div>

        </section>

      </main>


      {/* =========================
          NOTIFICATIONS
      ========================= */}

      {(statusMessage ||
        errorMessage) && (

        <div
          className={`notice ${
            errorMessage
              ? "error"
              : "success"
          }`}
        >
          {errorMessage ||
            statusMessage}
        </div>

      )}


      {/* =========================
          POLL LIST
      ========================= */}

      <section className="panel polls-panel">

        <div className="section-heading">

          <div>

            <p className="eyebrow">
              Poll List
            </p>

            <h2>
              Active polls
            </h2>

          </div>


          <span className="pill muted-pill">
            {polls.length} total
          </span>

        </div>


        {/* LOADING */}

        {loading ? (

          <div className="empty-state">

            <div
              className="spinner"
              aria-hidden="true"
            />

            <p>
              Loading polls...
            </p>

          </div>

        ) : polls.length === 0 ? (

          /* EMPTY */

          <div className="empty-state">

            <h3>
              No polls yet
            </h3>

            <p>
              Create your first poll to begin
              collecting live feedback.
            </p>

          </div>

        ) : (

          /* POLLS */

          <div className="poll-list">

            {polls.map((poll) => {

              const totalVotes =
                getTotalVotes(poll);

              const isHighlighted =
                highlightPollId ===
                poll._id;

              return (

                <article
                  key={poll._id}
                  className={`poll-card ${
                    isHighlighted
                      ? "highlighted"
                      : ""
                  }`}
                >

                  {/* POLL HEADER */}

                  <div className="poll-header-row">

                    <div>

                      <p className="poll-meta">
                        Live question
                      </p>

                      <h3>
                        {poll.question}
                      </h3>

                    </div>


                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        copyShareLink(
                          poll._id
                        )
                      }
                    >
                      Share link
                    </button>

                  </div>


                  {/* OPTIONS */}

                  <div className="poll-options">

                    {poll.options.map(
                      (option, index) => {

                        const voteCount =
                          poll.votes?.[
                            option
                          ] ?? 0;

                        return (

                          <div
                            className="vote-option"
                            key={`${poll._id}-${index}`}
                          >

                            <label className="vote-choice">

                              <input
                                type="radio"
                                name={`poll-${poll._id}`}
                                checked={
                                  selectedOptions[
                                    poll._id
                                  ] === option
                                }
                                onChange={() =>
                                  setSelectedOptions(
                                    (current) => ({
                                      ...current,
                                      [poll._id]:
                                        option,
                                    })
                                  )
                                }
                              />

                              <span>
                                {option}
                              </span>

                            </label>


                            <div className="vote-meta-row">

                              <span>
                                {voteCount} vote
                                {voteCount === 1
                                  ? ""
                                  : "s"}
                              </span>

                            </div>

                          </div>

                        );
                      }
                    )}

                  </div>


                  {/* POLL SUMMARY */}

                  <div className="poll-summary">

                    <span>
                      Total votes: {totalVotes}
                    </span>


                    <button
                      type="button"
                      className="primary-button vote-button"
                      onClick={() =>
                        handleVote(
                          poll._id
                        )
                      }
                      disabled={
                        votingPolls[
                          poll._id
                        ]
                      }
                    >
                      {votingPolls[
                        poll._id
                      ]
                        ? "Submitting..."
                        : "Submit Vote"}
                    </button>

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


// =========================
// TOTAL VOTES
// =========================

function getTotalVotes(poll) {

  if (
    !poll ||
    !Array.isArray(poll.options)
  ) {
    return 0;
  }

  return poll.options.reduce(
    (sum, option) =>
      sum +
      (poll.votes?.[option] ?? 0),
    0
  );
}


export default App;