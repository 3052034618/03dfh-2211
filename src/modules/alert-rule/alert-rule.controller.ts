import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AlertRuleService } from './alert-rule.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto, QueryAlertRuleDto } from './dto/alert-rule.dto';
import { PaginationDto, PaginatedResponse } from '../../common/dto/pagination.dto';
import { AlertRule } from '@prisma/client';

@ApiTags('告警规则')
@Controller('alert-rules')
export class AlertRuleController {
  constructor(private readonly alertRuleService: AlertRuleService) {}

  @Post()
  @ApiOperation({ summary: '创建告警规则' })
  @ApiResponse({ status: 201, description: '创建成功' })
  create(@Body() dto: CreateAlertRuleDto): Promise<AlertRule> {
    return this.alertRuleService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '获取告警规则列表' })
  findAll(
    @Query() query: QueryAlertRuleDto,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedResponse<AlertRule>> {
    return this.alertRuleService.findAll(query, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个告警规则' })
  findOne(@Param('id') id: string): Promise<AlertRule> {
    return this.alertRuleService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新告警规则' })
  update(@Param('id') id: string, @Body() dto: UpdateAlertRuleDto): Promise<AlertRule> {
    return this.alertRuleService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除告警规则' })
  remove(@Param('id') id: string): Promise<void> {
    return this.alertRuleService.remove(id);
  }
}
