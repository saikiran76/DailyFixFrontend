const AIInsights = ({ summary }) => {
    const [insights, setInsights] = useState(null);
    const [loading, setLoading] = useState(false);
  
    useEffect(() => {
      const fetchInsights = async () => {
        if (!summary?.recentActivity?.length) return;
  
        try {
          setLoading(true);
          const response = await axios.post(
            `/rooms/${encodeURIComponent(summary.roomId)}/batch-analyze`,
            { messages: summary.recentActivity }
          );
          setInsights(response.data.results);
        } catch (error) {
          console.error('Error fetching AI insights:', error);
        } finally {
          setLoading(false);
        }
      };
  
      fetchInsights();
    }, [summary]);
  
    if (!insights || loading) return null;
  
    return (
      <div className="bg-dark-lighter rounded-lg p-6 mt-4">
        <h2 className="text-xl font-semibold mb-4">AI Insights</h2>
        <div className="space-y-4">
          {insights.map((insight, index) => (
            <div key={index} className="border-b border-gray-700 pb-3">
              <div className="flex justify-between items-start mb-2">
                <span className={`px-2 py-1 rounded text-sm ${
                  insight.priority === 'high' ? 'bg-red-500' :
                  insight.priority === 'medium' ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}>
                  {insight.priority} Priority
                </span>
                <span className="text-gray-400">{insight.sentiment}</span>
              </div>
              <p className="text-gray-300 mb-2">{insight.keyPoints.join(', ')}</p>
              {insight.suggestedResponse.length > 0 && (
                <div className="text-sm text-gray-400">
                  <p className="font-medium">Suggested Responses:</p>
                  <ul className="list-disc pl-4">
                    {insight.suggestedResponse.map((response, i) => (
                      <li key={i}>{response}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };