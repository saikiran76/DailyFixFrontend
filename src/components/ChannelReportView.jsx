import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiDownload } from 'react-icons/fi';

const ChannelReportView = () => {
  const { serverId, reportId } = useParams();
  const [server, setServer] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        setLoading(true);
        const [serverResponse, reportResponse] = await Promise.all([
          axios.get(`http://localhost:3001/discord/servers/${serverId}`),
          axios.get(`http://localhost:3001/discord/servers/${serverId}/report/${reportId}`)
        ]);

        setServer(serverResponse.data);
        setReport(reportResponse.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching report:', err);
        setError('Failed to load report. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [serverId, reportId]);

  const handleDownload = async () => {
    try {
      const response = await axios.get(
        `http://localhost:3001/discord/servers/${serverId}/report/${reportId}/download`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-${reportId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading report:', err);
      setError('Failed to download report. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-error text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-dark">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-dark-lighter border-b border-dark">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/discord/servers/${serverId}`)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <FiArrowLeft className="text-xl" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-4">
            {server?.icon && (
              <img
                src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png`}
                alt={server.name}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{server?.name}</h1>
              <p className="text-gray-400">Report generated on {new Date(report?.generatedAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
        >
          <FiDownload className="text-xl" />
          <span>Download PDF</span>
        </button>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Summary Section */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Summary</h2>
            <div className="bg-dark-lighter rounded-lg p-6">
              <p className="text-gray-300 whitespace-pre-wrap">{report?.summary}</p>
            </div>
          </section>

          {/* Channel Reports */}
          {report?.channels.map(channel => (
            <section key={channel.id}>
              <h3 className="text-lg font-semibold text-white mb-4">
                # {channel.name}
              </h3>
              <div className="bg-dark-lighter rounded-lg p-6 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Key Points</h4>
                  <ul className="list-disc list-inside text-gray-300 space-y-2">
                    {channel.keyPoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
                {channel.actionItems.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Action Items</h4>
                    <ul className="list-disc list-inside text-gray-300 space-y-2">
                      {channel.actionItems.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChannelReportView; 