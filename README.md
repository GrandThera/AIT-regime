# Grand Thera Regime Dashboard

Grand Thera Regime Dashboard is a compact open source research demo for exploring financial time-series regime detection workflows in a clean analytical dashboard. It is designed for specialists who want to add a transparent, dependency-light market regime modeling tool to their research toolkit, inspect regime probabilities, stress-test cluster counts, and reason about transition behavior from raw price series.

This repository is not Grand Thera's final production technology. It does not include proprietary auto-calibration layers, production governance, automatic collaboration mechanisms, internal model orchestration, enterprise data pipelines, or any closed Grand Thera decision systems. Its purpose is research-oriented: to show how regime detection concepts, Markov Switching diagnostics, and interactive scenario analysis can be assembled into a small, inspectable tool.

**Project status:** research demo / alpha. The interface is usable as a standalone prototype, but it should be reviewed, extended, and validated before any production or regulated decision workflow.

## 1. Title and Description

**Title:** Grand Thera Regime Dashboard

**Description:** Grand Thera Regime Dashboard analyzes financial price series and estimates the probability that each modeled observation belongs to a specific market regime. The input is a time-ordered sequence of positive prices, provided through the browser interface or through API-driven flows. The output includes regime labels, per-observation probabilities, uncertainty, Viterbi path diagnostics, model selection criteria, transition matrices, and summary statistics.

The implementation is designed to be transparent and readable. Core components such as feature engineering, standardization, K-Means clustering, automatic regime-count selection, Gaussian Markov Switching estimation, Baum-Welch training, and Viterbi decoding are implemented in this repository instead of being delegated to black-box regime-switching or clustering engines. The project exists as a compact research/demo tool for studying regime classification workflows and for showing how interpretable market-state diagnostics can be assembled from first principles.

**Status:** in development as an open source research tool and demonstration artifact.

## 2. Demonstration and Visual

The main demo visual experience is available through the main HTML page:

```text
index.html
```

Serve the repository locally and open the page in a browser. The interface includes historical price visualization by regime, a regime timeline, summary statistics, model selection criteria, observation inspection, transition heatmaps, probability heatmaps, and an interactive return-volatility surface.

Suggested demo flow:

1. Open the page.
2. Select `Auto` or a fixed number of regimes in the K selector.
3. Inspect the price chart, timeline, probability heatmap, Markov transition matrix, and model diagnostics.
4. Upload a single-column CSV/XLS-style file with numeric prices to test a custom series.

## 3. Features

- Financial regime detection interface from a single ordered price series.
- Built-in sample dataset for immediate experimentation.
- CSV/XLS/XLSX-style upload flow through an external API.
- Backend-powered rolling feature engineering for returns, realized volatility, trend strength, drawdown, downside volatility, skewness, kurtosis, autocorrelation, range position, and EWMA volatility.
- Backend-powered automatic regime-count selection using silhouette score and model information criteria.
- Backend-powered Gaussian Markov Switching, hidden-state probabilities, transition dynamics, and Viterbi path.
- Probability output for each modeled observation.
- Summary statistics by regime, including share, average probability, average return, and volatility.
- Markov transition matrix for regime persistence and transition diagnostics.
- Browser-based HTML interface with dark/light mode.
- Interactive visual diagnostics, including price chart, regime timeline, probability heatmap, transition heatmap, and 3D return-volatility surface.
- CSV/JSON export paths from the interface.
- Compact operational UI designed for inspection and extension.

## 4. Prerequisites and Installation

### Requirements

- A modern browser with support for standard HTML, CSS, and JavaScript.
- Python 3.10+ if you want to serve files locally.
- Git for cloning the repository.

No Node.js build step is required for the current frontend because it is served as static HTML, CSS, and JavaScript files.

### Step by step

Clone the repository:

```bash
git clone https://github.com/GrandThera/regime.git
cd regime
```

Serve the repository locally:

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

Note: If another Grand Thera page is already running on the same port, this page may not load correctly. Try using a different port, such as 8001, 8002, or 3000.


## 5. API Dependency

This frontend consumes an external API for data processing and analytical responses.

The API is responsible for:

- parsing uploaded price series;
- calculating rolling features;
- selecting the number of regimes;
- estimating regime probabilities;
- calculating Viterbi paths;
- calculating Markov transition matrices;
- generating alerts and diagnostics;
- calculating summary statistics;
- generating the return-volatility surface;
- returning the full payload consumed by the frontend.

If the API base URL changes, update the corresponding API URL in the frontend JavaScript file.

## 6. How to Use

1. Open the page in a modern browser.
2. Load the built-in sample dataset, or upload your own CSV/XLS/XLSX file.
3. Select `Auto` or a fixed number of regimes in the K selector.
4. Inspect the price chart, regime timeline, probability heatmap, Markov transition matrix, and model diagnostics.
5. Use the observation inspector to review probabilities, hidden states, volatility, uncertainty, and average return for a selected observation.
6. Adjust the visible range to inspect scoped transition behavior and diagnostics.
7. Use CSV/JSON export controls when needed.

Example:

```python
from grandthera_simple_regime_detection import RegimeAnalyzer

prices = [
    100.0, 101.2, 102.1, 103.4, 102.9, 104.0,
    105.1, 104.8, 103.2, 101.5, 100.3, 99.4,
    99.6, 99.7, 99.8,
]

analyzer = RegimeAnalyzer(window=5, n_regimes=3)
result = analyzer.fit_predict(prices)

for row in result.rows:
    print(row.index, row.label, row.probabilities)

print(result.summary)
print(result.transition_matrix)
```

Automatic regime count:

```python
from grandthera_simple_regime_detection import RegimeAnalyzer

analyzer = RegimeAnalyzer(
    window=20,
    n_regimes="auto",
    auto_range=(2, 5),
    auto_method="bic",
)

result = analyzer.fit_predict(prices)

print(result.n_regimes)
print(result.selection_scores)
print(result.information_criteria)
```

## 7. Technologies Used

- HTML5 for the application structure.
- CSS3 for the Grand Thera / Palantir-like visual system.
- Vanilla JavaScript for API communication, interaction, plotting, and dashboard behavior.
- Fetch API for external API requests.
- FormData API for file upload requests.
- Browser File API for local file selection.
- SVG for chart, heatmap, and timeline rendering.
- Canvas for 3D return-volatility visualization.
- Python `http.server` for local static file serving during development.

No third-party frontend framework, charting library, clustering library, Markov Switching engine, machine learning framework, or build tool is required by the interface.

## 8. How to Contribute

Contributions are welcome when they preserve the research/demo nature of the project and keep the modeling assumptions transparent.

Useful contribution areas include:

- improving numerical stability in the Markov Switching estimation loop;
- adding tests for edge cases and longer market series;
- improving CSV/XLS import and export behavior;
- documenting feature engineering assumptions;
- extending diagnostics for probability calibration and transition stability;
- improving out-of-sample evaluation examples;
- refining dashboard UX, accessibility, and responsive layout;
- adding benchmark datasets or notebooks that clearly describe their assumptions.

Please keep changes focused, explain analytical-display changes clearly, and avoid adding heavy dependencies unless there is a strong research justification.

## 9. Authors and License

**Author:** Grand Thera Technologies

**License:** MIT. See [LICENSE](./LICENSE) for details.

This open source repository is provided as a research and demonstration tool. It should not be interpreted as a release of Grand Thera's final internal technology stack, production modeling infrastructure, proprietary auto-calibration systems, automatic collaboration mechanisms, internal orchestration layers, or enterprise decision workflows.