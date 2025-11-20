/**
 * 知识库管理页面
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  message,
  Tooltip,
  Badge,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Upload,
  Tabs
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  DatabaseOutlined,
  BulbOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as systemService from '../services/systemService';
import knowledgeService, {
  KnowledgeItem,
  KNOWLEDGE_CATEGORIES,
  KnowledgeStats
} from '../services/knowledgeService';

const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

interface System {
  id: number;
  name: string;
  description: string;
  status: string;
}

const KnowledgeManagement: React.FC = () => {
  const [form] = Form.useForm();
  const [systems, setSystems] = useState<System[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeItem | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [testSearchVisible, setTestSearchVisible] = useState(false);

  // 加载系统列表
  useEffect(() => {
    loadSystems();
  }, []);

  // 当选择系统后加载知识
  useEffect(() => {
    if (selectedSystem) {
      loadKnowledgeAndStats();
    }
  }, [selectedSystem]);

  const loadSystems = async () => {
    try {
      const response = await systemService.getSystems();
      setSystems(response.data);
      if (response.data.length > 0) {
        setSelectedSystem(response.data[0].name);
      }
    } catch (error) {
      message.error('加载系统列表失败');
      console.error(error);
    }
  };

  const loadKnowledgeAndStats = async () => {
    if (!selectedSystem) return;

    setLoading(true);
    try {
      // 并行加载统计和知识列表
      const [statsData, searchResults] = await Promise.all([
        knowledgeService.getSystemStats(selectedSystem),
        knowledgeService.searchKnowledge({
          query: searchKeyword || ' ', // 用空格查询所有
          systemName: selectedSystem,
          topK: 100
        })
      ]);

      setStats(statsData);
      // 确保searchResults是数组
      if (Array.isArray(searchResults)) {
        setKnowledgeList(searchResults.map(r => r.knowledge));
      } else {
        setKnowledgeList([]);
      }
    } catch (error) {
      message.error('加载知识库数据失败: 请确保后端服务正常运行');
      console.error(error);
      // 设置空数据避免渲染错误
      setStats(null);
      setKnowledgeList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedSystem) {
      message.warning('请先选择系统');
      return;
    }

    setLoading(true);
    try {
      const results = await knowledgeService.searchKnowledge({
        query: searchKeyword || ' ',
        systemName: selectedSystem,
        category: filterCategory || undefined,
        topK: 100
      });

      // 确保results是数组
      if (Array.isArray(results)) {
        setKnowledgeList(results.map(r => r.knowledge));
      } else {
        setKnowledgeList([]);
      }
    } catch (error) {
      message.error('搜索失败: 请确保后端服务正常运行');
      console.error(error);
      setKnowledgeList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingKnowledge(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (knowledge: KnowledgeItem) => {
    setEditingKnowledge(knowledge);
    form.setFieldsValue({
      ...knowledge,
      tags: knowledge.tags.join(', ')
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      const knowledge: KnowledgeItem = {
        category: values.category,
        title: values.title,
        content: values.content,
        businessDomain: values.businessDomain,
        tags: typeof values.tags === 'string'
          ? values.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
          : values.tags,
        metadata: values.metadata ? JSON.parse(values.metadata) : undefined
      };

      // 验证
      const validation = knowledgeService.validateKnowledge(knowledge);
      if (!validation.valid) {
        message.error(validation.errors.join('; '));
        return;
      }

      if (!selectedSystem) {
        message.warning('请先选择系统');
        return;
      }

      await knowledgeService.addKnowledge(selectedSystem, knowledge);
      message.success(editingKnowledge ? '更新成功' : '添加成功');
      setModalVisible(false);
      loadKnowledgeAndStats();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        message.error('保存失败: ' + (error.message || '未知错误'));
        console.error(error);
      }
    }
  };

  const handleBatchImport = async (file: File) => {
    if (!selectedSystem) {
      message.warning('请先选择系统');
      return false;
    }

    try {
      const result = await knowledgeService.importFromJSON(selectedSystem, file);

      if (result.success > 0) {
        message.success(`成功导入 ${result.success} 条知识`);
        loadKnowledgeAndStats();
      }

      if (result.failed > 0) {
        Modal.warning({
          title: `导入完成，但有 ${result.failed} 条失败`,
          content: (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {result.errors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )
        });
      }
    } catch (error: any) {
      message.error('导入失败: ' + (error.message || '未知错误'));
    }

    return false; // 阻止自动上传
  };

  const handleExport = () => {
    if (knowledgeList.length === 0) {
      message.warning('暂无知识可导出');
      return;
    }

    const filename = `knowledge_${selectedSystem}_${new Date().toISOString().split('T')[0]}.json`;
    knowledgeService.downloadAsJSON(knowledgeList, filename);
    message.success('导出成功');
  };

  const columns: ColumnsType<KnowledgeItem> = [
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => {
        const config = knowledgeService.getCategoryConfig(category);
        return config ? (
          <Tag color={config.color}>
            {config.icon} {config.label}
          </Tag>
        ) : (
          <Tag>{category}</Tag>
        );
      }
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      ellipsis: true
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text}
          </div>
        </Tooltip>
      )
    },
    {
      title: '业务领域',
      dataIndex: 'businessDomain',
      key: 'businessDomain',
      width: 120
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      render: (tags: string[]) => (
        <>
          {tags.map(tag => (
            <Tag key={tag} style={{ marginBottom: 4 }}>{tag}</Tag>
          ))}
        </>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题和系统选择 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>
              <DatabaseOutlined /> 知识库管理
            </h2>
            <Space>
              <span>选择系统：</span>
              <Select
                style={{ width: 200 }}
                value={selectedSystem}
                onChange={setSelectedSystem}
                placeholder="请选择系统"
              >
                {systems.map(sys => (
                  <Option key={sys.id} value={sys.name}>
                    {sys.name}
                  </Option>
                ))}
              </Select>
            </Space>
          </div>

          {/* 统计信息 */}
          {stats && stats.byCategory && (
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总知识数"
                    value={stats.totalKnowledge || 0}
                    prefix={<DatabaseOutlined />}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="业务规则"
                    value={stats.byCategory.business_rule || 0}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col span={4}>
                <Card>
                  <Statistic
                    title="测试模式"
                    value={stats.byCategory.test_pattern || 0}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={5}>
                <Card>
                  <Statistic
                    title="历史踩坑点"
                    value={stats.byCategory.pitfall || 0}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={5}>
                <Card>
                  <Statistic
                    title="资损风险场景"
                    value={stats.byCategory.risk_scenario || 0}
                    valueStyle={{ color: '#f5222d' }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {/* 搜索和操作按钮 */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <Input
                placeholder="搜索知识标题或内容"
                style={{ width: 300 }}
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                onPressEnter={handleSearch}
                prefix={<SearchOutlined />}
              />
              <Select
                style={{ width: 150 }}
                placeholder="筛选类别"
                allowClear
                value={filterCategory}
                onChange={setFilterCategory}
              >
                {KNOWLEDGE_CATEGORIES.map(cat => (
                  <Option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </Option>
                ))}
              </Select>
              <Button icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadKnowledgeAndStats}>
                刷新
              </Button>
            </Space>

            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                disabled={!selectedSystem}
              >
                添加知识
              </Button>
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={handleBatchImport}
                disabled={!selectedSystem}
              >
                <Button icon={<UploadOutlined />} disabled={!selectedSystem}>
                  批量导入
                </Button>
              </Upload>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExport}
                disabled={knowledgeList.length === 0}
              >
                导出JSON
              </Button>
              <Button
                icon={<BulbOutlined />}
                onClick={() => setTestSearchVisible(true)}
                disabled={!selectedSystem}
              >
                测试搜索
              </Button>
            </Space>
          </div>

          {/* 知识列表表格 */}
          <Table
            columns={columns}
            dataSource={knowledgeList}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: total => `共 ${total} 条知识`
            }}
            scroll={{ x: 1200 }}
          />
        </Space>
      </Card>

      {/* 添加/编辑知识对话框 */}
      <Modal
        title={editingKnowledge ? '编辑知识' : '添加知识'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            category: 'business_rule'
          }}
        >
          <Form.Item
            name="category"
            label="知识类别"
            rules={[{ required: true, message: '请选择知识类别' }]}
          >
            <Select placeholder="选择类别">
              {KNOWLEDGE_CATEGORIES.map(cat => (
                <Option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="知识标题"
            rules={[
              { required: true, message: '请输入知识标题' },
              { min: 5, message: '标题至少5个字符' },
              { max: 200, message: '标题最多200个字符' }
            ]}
          >
            <Input placeholder="简洁明确的标题，如：订单超时自动取消规则" />
          </Form.Item>

          <Form.Item
            name="content"
            label="知识内容"
            rules={[
              { required: true, message: '请输入知识内容' },
              { min: 10, message: '内容至少10个字符' },
              { max: 5000, message: '内容最多5000个字符' }
            ]}
          >
            <TextArea
              rows={6}
              placeholder="详细描述该知识点，包括背景、规则、注意事项等"
            />
          </Form.Item>

          <Form.Item
            name="businessDomain"
            label="业务领域"
            rules={[{ required: true, message: '请输入业务领域' }]}
          >
            <Input placeholder="如：订单管理、优惠促销、库存管理等" />
          </Form.Item>

          <Form.Item
            name="tags"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
            extra="多个标签用逗号分隔，如：订单,超时,自动取消"
          >
            <Input placeholder="订单,超时,自动取消" />
          </Form.Item>

          <Form.Item
            name="metadata"
            label="额外元数据（可选）"
            extra='JSON格式，如：{"severity": "high", "version": "v2.0"}'
          >
            <TextArea rows={2} placeholder='{"severity": "high"}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* 测试搜索对话框 */}
      <Modal
        title="测试知识库搜索"
        open={testSearchVisible}
        onCancel={() => setTestSearchVisible(false)}
        footer={null}
        width={900}
      >
        <TestSearchPanel systemName={selectedSystem} />
      </Modal>
    </div>
  );
};

// 测试搜索面板组件
const TestSearchPanel: React.FC<{ systemName: string }> = ({ systemName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleTestSearch = async () => {
    if (!searchQuery.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    setSearching(true);
    try {
      const data = await knowledgeService.testSearch({
        query: searchQuery,
        systemName,
        topK: 5
      });
      setResults(data);
    } catch (error) {
      message.error('搜索失败');
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Input.Search
        placeholder="输入测试查询内容，如：订单超时自动取消"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onSearch={handleTestSearch}
        loading={searching}
        enterButton="测试搜索"
        size="large"
      />

      {results && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Badge count={results.totalFound} showZero>
              <span style={{ fontSize: 16, fontWeight: 500 }}>搜索结果</span>
            </Badge>
            <span style={{ marginLeft: 16, color: '#666' }}>
              查询: "{results.query}" | 系统: {results.systemName}
            </span>
          </div>

          {results.results.length > 0 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {results.results.map((result: any, index: number) => {
                const config = knowledgeService.getCategoryConfig(result.knowledge.category);
                return (
                  <Card key={index} size="small">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Space>
                        {config && (
                          <Tag color={config.color}>
                            {config.icon} {config.label}
                          </Tag>
                        )}
                        <span style={{ fontWeight: 500 }}>{result.knowledge.title}</span>
                      </Space>
                      <Tag color={result.score >= 0.8 ? 'green' : result.score >= 0.6 ? 'orange' : 'default'}>
                        相似度: {(result.score * 100).toFixed(1)}%
                      </Tag>
                    </div>
                    <div style={{ marginTop: 8, color: '#666' }}>
                      {result.knowledge.content}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Space size={[0, 8]} wrap>
                        <Tag>领域: {result.knowledge.businessDomain}</Tag>
                        {result.knowledge.tags.map((tag: string) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </Space>
                    </div>
                  </Card>
                );
              })}
            </Space>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
              未找到相关知识，建议：
              <br />
              1. 尝试更换关键词
              <br />
              2. 添加相关知识到知识库
            </div>
          )}
        </div>
      )}
    </Space>
  );
};

export default KnowledgeManagement;
